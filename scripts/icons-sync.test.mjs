// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/*
| Pruebas de `icons-sync.mjs --check`: el modo que corre en CI, sin red y sin
| escribir. Se ejecuta el script de verdad (código de salida y mensajes) sobre
| copias temporales de resources/icons/colombia: los versionados no se tocan.
*/

const SCRIPT = fileURLToPath(new URL('./icons-sync.mjs', import.meta.url));
const VERSIONED = fileURLToPath(new URL('../resources/icons/colombia', import.meta.url));

const temporary = [];

function copyOfVersioned() {
    const dir = mkdtempSync(path.join(tmpdir(), 'veni-icons-'));
    temporary.push(dir);
    cpSync(VERSIONED, dir, { recursive: true });

    return dir;
}

function check(dir) {
    const result = spawnSync(process.execPath, [SCRIPT, '--check', '--dir', dir], { encoding: 'utf8' });

    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Contenido de cada archivo de la carpeta, para comprobar que --check no escribe. */
function snapshot(dir) {
    return Object.fromEntries(
        readdirSync(dir)
            .sort()
            .map((file) => [file, readFileSync(path.join(dir, file), 'utf8')]),
    );
}

/** Reemplaza un ícono y pone su sha256 en el manifiesto: solo queda por fallar la validación del SVG. */
function replaceIcon(dir, name, svg) {
    const file = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));

    writeFileSync(path.join(dir, `${name}.svg`), svg);
    manifest.icons[name].sha256 = createHash('sha256').update(svg).digest('hex');
    writeFileSync(file, `${JSON.stringify(manifest, null, 4)}\n`);
}

function svg(body, rootAttributes = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"${rootAttributes}>\n  ${body}\n</svg>\n`;
}

afterEach(() => {
    for (const dir of temporary.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('icons-sync --check', () => {
    it('los íconos versionados coinciden con el manifiesto', () => {
        const { status, stdout, stderr } = check(VERSIONED);

        expect(stderr).toBe('');
        expect(stdout).toMatch(/^Íconos al día: \d+ de Mteheran\/colombia-icons v\d+\.\d+\.\d+\.\n$/);
        expect(status).toBe(0);
    });

    it('acepta una copia intacta y no escribe nada', () => {
        const dir = copyOfVersioned();
        const before = snapshot(dir);

        expect(check(dir).status).toBe(0);
        expect(snapshot(dir)).toEqual(before);
    });

    it('falla si se altera un SVG, y lo deja como estaba', () => {
        const dir = copyOfVersioned();
        const file = path.join(dir, 'sol.svg');
        writeFileSync(file, readFileSync(file, 'utf8').replace('r="4"', 'r="5"'));
        const before = snapshot(dir);

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain('sol.svg: el sha256 no coincide con el manifiesto');
        expect(stderr).toContain('1 problema(s)');
        expect(snapshot(dir)).toEqual(before);
    });

    it('falla si se altera la licencia', () => {
        const dir = copyOfVersioned();
        writeFileSync(path.join(dir, 'LICENSE'), 'Todos los derechos reservados.\n');

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain('LICENSE: el sha256 no coincide con el manifiesto');
    });

    it.each(['sol.svg', 'LICENSE'])('falla si falta %s', (file) => {
        const dir = copyOfVersioned();
        rmSync(path.join(dir, file));

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain(`${file}: está en el manifiesto pero no en la carpeta`);
    });

    it('falla si hay un SVG que el manifiesto no menciona', () => {
        const dir = copyOfVersioned();
        cpSync(path.join(dir, 'sol.svg'), path.join(dir, 'colado.svg'));

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain('colado.svg: está en la carpeta pero no en el manifiesto');
    });

    it.each([
        ['<script>', svg('<script>alert(1)</script>'), 'contiene <script>'],
        ['un evento', svg('<path d="M4 4H20" onclick="alert(1)"/>'), 'tiene atributos de evento'],
        ['un evento en la raíz', svg('<path d="M4 4H20"/>', ' onload="alert(1)"'), 'tiene atributos de evento'],
        ['un enlace externo', svg('<use href="https://example.test/a.svg#x"/>'), 'tiene enlaces (href)'],
        ['un enlace xlink', svg('<a xlink:href="javascript:alert(1)"><path d="M4 4H20"/></a>'), 'tiene enlaces (href)'],
        ['<foreignObject>', svg('<foreignObject><p>hola</p></foreignObject>'), 'elemento no admitido: <foreignObject>'],
        ['<style>', svg('<style>path { fill: red }</style>'), 'elemento no admitido: <style>'],
        ['un estilo en línea', svg('<path d="M4 4H20" style="fill: red"/>'), 'atributo no admitido en <path>: style'],
        ['una referencia url()', svg('<path d="M4 4H20" fill="url(#a)"/>'), 'tiene referencias url()'],
        ['un comentario', svg('<!-- nota --><path d="M4 4H20"/>'), 'etiqueta con formato no admitido'],
        ['otro viewBox', svg('<path d="M4 4H20"/>').replace('0 0 24 24', '0 0 48 48'), 'el viewBox no es «0 0 24 24»'],
        ['una etiqueta sin cerrar', svg('<g><path d="M4 4H20"/>'), 'cierre sin apertura'],
    ])('rechaza un SVG con %s aunque su sha256 coincida', (_case, content, problem) => {
        const dir = copyOfVersioned();
        replaceIcon(dir, 'sol', content);

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain(`sol.svg: ${problem}`);
        expect(stderr).not.toContain('sha256');
    });

    it('falla si el manifiesto no fija el commit o un sha256', () => {
        const dir = copyOfVersioned();
        const file = path.join(dir, 'manifest.json');
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        delete manifest.commit;
        delete manifest.icons.luna.sha256;
        writeFileSync(file, JSON.stringify(manifest));

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain('el manifiesto no tiene «commit»');
        expect(stderr).toContain('luna.svg: sin sha256 en el manifiesto');
    });

    it('falla si un nombre del manifiesto podría salirse de la carpeta', () => {
        const dir = copyOfVersioned();
        const file = path.join(dir, 'manifest.json');
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        manifest.icons['../fuera'] = { path: 'icons/svg/genericos/sol.svg' };
        writeFileSync(file, JSON.stringify(manifest));

        const { status, stderr } = check(dir);

        expect(status).toBe(1);
        expect(stderr).toContain('«../fuera» no es un nombre válido');
    });
});
