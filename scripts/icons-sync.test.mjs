// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { sync, verify } from './icons-sync.mjs';

/*
| Pruebas de `icons-sync.mjs --check`: el modo que corre en CI, sin red y sin
| escribir. Se ejecuta el script de verdad (código de salida y mensajes) sobre
| copias temporales de resources/icons/colombia: los versionados no se tocan.
|
| La sincronización se prueba llamando a la función con un `fetch` de mentira
| que responde como GitHub: las pruebas no usan la red.
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

/** Contenido de cada archivo de la carpeta, para comprobar que no se escribió nada. */
function snapshot(dir) {
    return Object.fromEntries(
        readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'en'))
            .map((entry) => [
                entry.name,
                entry.isFile() ? readFileSync(path.join(dir, entry.name), 'utf8') : '<carpeta>',
            ]),
    );
}

function readManifest(dir) {
    return JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
}

function writeManifest(dir, manifest) {
    writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 4)}\n`);
}

/**
 * Un origen de mentira con lo mismo que hay versionado: el tag apunta a
 * `commit` y cada ruta de origen del manifiesto devuelve su archivo. `files`
 * (ruta de origen → contenido o código HTTP) se puede cambiar antes de sincronizar.
 */
function fakeOrigin({ commit } = {}) {
    const manifest = readManifest(VERSIONED);
    const origin = {
        commit: commit ?? manifest.commit,
        files: { LICENSE: readFileSync(path.join(VERSIONED, 'LICENSE'), 'utf8') },
        requests: [],
    };

    for (const [name, entry] of Object.entries(manifest.icons)) {
        origin.files[entry.path] = readFileSync(path.join(VERSIONED, `${name}.svg`), 'utf8');
    }

    origin.fetch = (url, options) => {
        origin.requests.push({ url, options });

        if (url === `https://api.github.com/repos/${manifest.repository}/commits/refs/tags/${manifest.tag}`) {
            return Promise.resolve(new Response(`${origin.commit}\n`));
        }

        const prefix = `https://raw.githubusercontent.com/${manifest.repository}/${origin.commit}/`;
        const file = url.startsWith(prefix) ? origin.files[url.slice(prefix.length)] : undefined;

        if (typeof file === 'number') {
            return Promise.resolve(new Response('error', { status: file }));
        }

        return Promise.resolve(
            file === undefined ? new Response('404: Not Found', { status: 404 }) : new Response(file),
        );
    };

    return origin;
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
        [
            'una entidad en un valor',
            svg('<path d="M4 4H20" fill="&#117;rl(https://evil.test/p.svg#a)"/>'),
            'valor no admitido en fill de <path>',
        ],
        [
            'un estilo en la raíz',
            svg('<path d="M4 4H20"/>', ' style="background: red"'),
            'atributo no admitido en <svg>: style',
        ],
        [
            'texto suelto entre elementos',
            svg('<path d="M4 4H20"/>hola<path d="M4 8H20"/>'),
            'tiene texto fuera de las etiquetas',
        ],
        [
            'la raíz sin xmlns',
            svg('<path d="M4 4H20"/>').replace('xmlns="http://www.w3.org/2000/svg" ', ''),
            'falta el xmlns de SVG',
        ],
        [
            'otro xmlns en la raíz',
            svg('<path d="M4 4H20"/>').replace('http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml'),
            'falta el xmlns de SVG',
        ],
        [
            'contenido después de </svg>',
            `${svg('<path d="M4 4H20"/>')}<path d="M4 8H20"/>\n`,
            'no termina con </svg>',
        ],
        [
            'una raíz que no es <svg>',
            svg('<path d="M4 4H20"/>').replace('<svg ', '<g ').replace('</svg>', '</g>'),
            'no empieza con <svg>',
        ],
        // Icon separa la raíz con ^<svg: con algo antes, el ícono no se pintaría.
        ['un BOM inicial', `\uFEFF${svg('<path d="M4 4H20"/>')}`, 'no empieza exactamente por «<svg »'],
        ['un salto de línea inicial', `\n${svg('<path d="M4 4H20"/>')}`, 'no empieza exactamente por «<svg »'],
        // Para el navegador un NBSP no separa nada: sería parte del nombre o del valor.
        ['un separador NBSP', svg('<path\u00A0d="M4 4H20"/>'), 'etiqueta con formato no admitido: <path'],
        ['un NBSP en un valor', svg('<path d="M4\u00A04H20"/>'), 'valor no admitido en d de <path>'],
        [
            'un NBSP entre elementos',
            svg('<path d="M4 4H20"/>\u00A0<path d="M4 8H20"/>'),
            'tiene texto fuera de las etiquetas',
        ],
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

describe('icons-sync (sincronización)', () => {
    it('descarga lo que falta y completa el manifiesto', async () => {
        const dir = copyOfVersioned();
        const manifest = readManifest(dir);
        delete manifest.icons.sol.sha256;
        writeManifest(dir, manifest);
        rmSync(path.join(dir, 'sol.svg'));

        const { problems, summary } = await sync(dir, { fetch: fakeOrigin().fetch });

        expect(problems).toEqual([]);
        expect(summary).toContain('40 íconos de Mteheran/colombia-icons v0.27.0 (4f90c54)');
        expect(snapshot(dir)).toEqual(snapshot(VERSIONED));
    });

    it('no escribe si el tag se movió', async () => {
        const dir = copyOfVersioned();
        const moved = 'b'.repeat(40);
        const origin = fakeOrigin({ commit: moved });
        // Con algo por escribir: si siguiera adelante, se notaría.
        rmSync(path.join(dir, 'sol.svg'));
        const before = snapshot(dir);

        const { problems } = await sync(dir, { fetch: origin.fetch });

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain(
            `el tag v0.27.0 apunta a ${moved} y el manifiesto dice ${readManifest(dir).commit}`,
        );
        // Un tag que se mueve no se acepta de paso: el mensaje no manda a repetir con --update sin más.
        expect(problems[0]).not.toContain('revisá el cambio y repetí con --update');
        expect(problems[0]).toContain('Si no lo cambiaste, el tag se movió en el origen');
        expect(snapshot(dir)).toEqual(before);
        // Ni siquiera descarga: solo preguntó a qué commit apunta el tag.
        expect(origin.requests).toHaveLength(1);
    });

    it('sin nada que cambiar no informa cambios ni altera la carpeta', async () => {
        const dir = copyOfVersioned();

        const { problems, changes } = await sync(dir, { fetch: fakeOrigin().fetch });

        expect(problems).toEqual([]);
        expect(changes).toEqual([]);
        expect(snapshot(dir)).toEqual(snapshot(VERSIONED));
    });

    it('--update informa qué cambió: commit, archivos distintos, nuevos y quitados', async () => {
        const dir = copyOfVersioned();
        const manifest = readManifest(dir);
        const moved = 'b'.repeat(40);
        const origin = fakeOrigin({ commit: moved });
        const redrawn = svg('<path d="M4 4H20"/>');
        origin.files['icons/svg/genericos/sol.svg'] = redrawn;
        origin.files['icons/svg/genericos/nuevo.svg'] = svg('<path d="M4 8H20"/>');
        manifest.icons.nuevo = { path: 'icons/svg/genericos/nuevo.svg' };
        delete manifest.icons.luna;
        writeManifest(dir, manifest);

        const { problems, changes } = await sync(dir, { update: true, fetch: origin.fetch });

        expect(problems).toEqual([]);
        expect(changes).toEqual([
            `commit de v0.27.0: ${manifest.commit} → ${moved}`,
            'cambió: sol.svg',
            'nuevo: nuevo.svg',
            'quitado: luna.svg',
        ]);
        expect(readFileSync(path.join(dir, 'sol.svg'), 'utf8')).toBe(redrawn);
        expect(readManifest(dir).commit).toBe(moved);
        expect(check(dir).status).toBe(0);
    });

    it('sin --update no acepta un archivo distinto al del manifiesto', async () => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();
        origin.files['icons/svg/genericos/sol.svg'] = svg('<path d="M4 4H20"/>');
        const before = snapshot(dir);

        const { problems } = await sync(dir, { fetch: origin.fetch });

        expect(problems).toEqual(['sol.svg: el sha256 descargado no coincide con el manifiesto (--update lo acepta)']);
        expect(snapshot(dir)).toEqual(before);
    });

    it('no sigue redirecciones: pide todo con redirect «error»', async () => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();

        await sync(dir, { fetch: origin.fetch });

        // El tag, la licencia y los 40 íconos.
        expect(origin.requests).toHaveLength(42);
        expect(origin.requests.filter(({ options }) => options.redirect !== 'error')).toEqual([]);
    });

    it('si una petición falla (una redirección, sin red), dice cuál y no escribe', async () => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();
        const url = `https://raw.githubusercontent.com/Mteheran/colombia-icons/${origin.commit}/icons/svg/genericos/sol.svg`;
        writeFileSync(path.join(dir, 'LICENSE'), 'Alterada.\n');
        const before = snapshot(dir);
        // Así falla el fetch de Node con redirect: 'error' cuando el servidor redirige.
        const fetch = (requested, options) =>
            requested === url
                ? Promise.reject(new TypeError('fetch failed', { cause: new Error('unexpected redirect') }))
                : origin.fetch(requested, options);

        await expect(sync(dir, { fetch })).rejects.toThrow(`No se pudo pedir ${url}: fetch failed (unexpected redirect)`);
        expect(snapshot(dir)).toEqual(before);
    });

    it('borra huérfanos', async () => {
        const dir = copyOfVersioned();
        const manifest = readManifest(dir);
        // Uno que nunca estuvo en el manifiesto y otro que se quitó de él.
        cpSync(path.join(dir, 'sol.svg'), path.join(dir, 'colado.svg'));
        delete manifest.icons.luna;
        writeManifest(dir, manifest);

        const { problems, changes } = await sync(dir, { fetch: fakeOrigin().fetch });

        expect(problems).toEqual([]);
        expect(changes).toEqual(['quitado: colado.svg', 'quitado: luna.svg']);
        expect(readdirSync(dir)).not.toContain('colado.svg');
        expect(readdirSync(dir)).not.toContain('luna.svg');
        expect(readdirSync(dir).filter((file) => file.endsWith('.svg'))).toHaveLength(39);
        expect(check(dir).status).toBe(0);
    });

    it('no borra lo que acaba de escribir', async () => {
        const dir = copyOfVersioned();
        // En Windows «Sol.svg» y «sol.svg» son el mismo archivo: escribir uno y borrar el otro lo perdía.
        renameSync(path.join(dir, 'sol.svg'), path.join(dir, 'Sol.svg'));

        const { problems } = await sync(dir, { fetch: fakeOrigin().fetch });

        expect(problems).toEqual([]);
        expect(readdirSync(dir)).toContain('sol.svg');
        expect(readdirSync(dir)).not.toContain('Sol.svg');
        expect(snapshot(dir)).toEqual(snapshot(VERSIONED));
    });

    it.each([
        [
            'una carpeta con nombre de ícono que sobra',
            (dir) => {
                mkdirSync(path.join(dir, 'colado.svg'));
            },
            'colado.svg: no es un archivo',
        ],
        [
            'una carpeta donde va un ícono',
            (dir) => {
                rmSync(path.join(dir, 'sol.svg'));
                // En Windows también ocupa el lugar de «sol.svg».
                mkdirSync(path.join(dir, 'Sol.svg'));
            },
            'Sol.svg: no es un archivo',
        ],
        [
            'una descarga con error',
            (_dir, origin) => {
                origin.files['icons/svg/genericos/sol.svg'] = 500;
            },
            'sol.svg: HTTP 500 al descargar icons/svg/genericos/sol.svg',
        ],
    ])('no escribe nada si falla a mitad: %s', async (_case, prepare, problem) => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();
        // La licencia es lo primero que se escribe: si queda como estaba, no se escribió nada.
        writeFileSync(path.join(dir, 'LICENSE'), 'Alterada.\n');
        prepare(dir, origin);
        const before = snapshot(dir);

        const { problems } = await sync(dir, { fetch: origin.fetch });

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain(problem);
        expect(snapshot(dir)).toEqual(before);
    });
});

describe('icons-sync --verify', () => {
    it('acepta lo que es idéntico al commit fijado, sin escribir ni preguntar por el tag', async () => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();
        const before = snapshot(dir);

        expect(await verify(dir, { fetch: origin.fetch })).toEqual([]);
        expect(snapshot(dir)).toEqual(before);
        // La licencia y los 40 íconos, todos del commit del manifiesto y sin seguir redirecciones.
        expect(origin.requests).toHaveLength(41);
        expect(
            origin.requests.filter(
                ({ url, options }) =>
                    !url.startsWith(`https://raw.githubusercontent.com/Mteheran/colombia-icons/${origin.commit}/`) ||
                    options.redirect !== 'error',
            ),
        ).toEqual([]);
    });

    it.each([
        ['sol.svg', 'icons/svg/genericos/sol.svg', svg('<path d="M4 4H20"/>')],
        ['LICENSE', 'LICENSE', 'Todos los derechos reservados.\n'],
    ])('verify falla si lo local difiere del origen aunque el manifiesto coincida: %s', async (file, source, content) => {
        const dir = copyOfVersioned();
        const manifest = readManifest(dir);
        const entry = file === 'LICENSE' ? manifest.license : manifest.icons.sol;
        // Alguien cambia el archivo y pone su sha256 en el manifiesto: --check no lo nota.
        writeFileSync(path.join(dir, file), content);
        entry.sha256 = createHash('sha256').update(content).digest('hex');
        writeManifest(dir, manifest);
        const before = snapshot(dir);

        expect(check(dir).status).toBe(0);
        expect(await verify(dir, { fetch: fakeOrigin().fetch })).toEqual([
            `${file}: no es igual a ${source} en el commit ${manifest.commit}`,
        ]);
        expect(snapshot(dir)).toEqual(before);
    });

    it('falla si falta un archivo en la carpeta o en el origen', async () => {
        const dir = copyOfVersioned();
        const origin = fakeOrigin();
        rmSync(path.join(dir, 'sol.svg'));
        delete origin.files['icons/svg/genericos/luna.svg'];

        expect(await verify(dir, { fetch: origin.fetch })).toEqual([
            `luna.svg: HTTP 404 al descargar icons/svg/genericos/luna.svg del commit ${origin.commit}`,
            'sol.svg: está en el manifiesto pero no en la carpeta',
        ]);
    });

    it('falla si el manifiesto no fija el commit', async () => {
        const dir = copyOfVersioned();
        const manifest = readManifest(dir);
        const origin = fakeOrigin();
        delete manifest.commit;
        writeManifest(dir, manifest);

        expect(await verify(dir, { fetch: origin.fetch })).toEqual([
            'el manifiesto no tiene «commit»: ejecutá npm run icons:sync',
        ]);
        expect(origin.requests).toEqual([]);
    });
});
