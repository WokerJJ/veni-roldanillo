/**
 * Íconos de colombia-icons copiados desde una versión fija (ADR 0011).
 *
 *   npm run icons:sync               Descarga los íconos del manifiesto desde su tag y verifica los sha256.
 *   npm run icons:sync -- --update   Además acepta un commit o unos sha256 distintos (al cambiar de tag) y dice cuáles.
 *   npm run icons:check              Sin red y sin escribir: lo versionado coincide con el manifiesto.
 *   npm run icons:verify             Con red y sin escribir: lo versionado es idéntico al commit fijado del origen.
 *
 * --check prueba coherencia (carpeta y manifiesto dicen lo mismo); la
 * procedencia (que eso mismo es lo que publicó el origen) la prueba --verify.
 *
 * El manifiesto (resources/icons/colombia/manifest.json) dice qué íconos se
 * copian y de qué versión; --dir apunta a otra carpeta (lo usan las pruebas).
 * Solo usa módulos de Node: no agrega dependencias.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/icons/colombia');
const MANIFEST_FILE = 'manifest.json';
const LICENSE_FILE = 'LICENSE';

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const TAG = /^v\d+\.\d+\.\d+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// El nombre es también el nombre del archivo: sin puntos ni barras.
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_PATH = /^icons\/svg\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/;

/*
| Lista blanca de lo que puede traer un ícono. El componente Icon inserta el
| contenido del SVG en la página, así que aquí se rechaza todo lo que no sea
| dibujo: <script>, <style>, <foreignObject>, <use>, eventos (onload=),
| enlaces (href), estilos en línea y referencias url().
*/
const VIEW_BOX = '0 0 24 24';
const ROOT_ATTRIBUTES = new Set([
    'xmlns',
    'width',
    'height',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
]);
const SHAPES = new Set(['g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);
const SHAPE_ATTRIBUTES = new Set([
    'd',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'width',
    'height',
    'points',
    'transform',
    'opacity',
    'fill',
    'fill-rule',
    'clip-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
]);
// Separan solo espacio, tabulación y salto de línea, como en el navegador: «\s»
// aceptaría también NBSP, BOM y otros espacios Unicode, que para él no separan nada.
const TAG_SHAPE = /^<(\/?)([A-Za-z][\w:-]*)((?:[ \t\n]+[\w:-]+="[^"]*")*)[ \t\n]*(\/?)>$/;
// Números, datos de trazo, colores y transformaciones; nada de «:», «&», «;» ni comillas.
const SAFE_VALUE = /^[\w \t\n.,#%()+-]*$/;

function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}

/** Git guarda los SVG con LF (.gitattributes): el sha256 es el del archivo versionado. */
function normalize(content) {
    return content.replace(/\r\n?/g, '\n');
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Problemas de un SVG, en palabras; vacío si solo trae dibujo.
 *
 * @param {string} svg
 * @returns {string[]}
 */
function validateSvg(svg) {
    const problems = [];

    // Nombres claros para lo peligroso; la lista blanca de abajo también lo rechazaría.
    if (/<script\b/i.test(svg)) {
        problems.push('contiene <script>');
    }

    if (/\son[a-z]+\s*=/i.test(svg)) {
        problems.push('tiene atributos de evento (on…=)');
    }

    if (/\b(?:xlink:)?href\s*=/i.test(svg)) {
        problems.push('tiene enlaces (href)');
    }

    if (/url\s*\(/i.test(svg)) {
        problems.push('tiene referencias url()');
    }

    // Icon separa la raíz con ^<svg: con un BOM o un espacio antes, el ícono no se pintaría.
    if (!svg.startsWith('<svg ')) {
        problems.push('no empieza exactamente por «<svg » (sin BOM ni espacios antes)');
    }

    const tags = svg.match(/<[^>]*>/g) ?? [];

    if (/[^ \t\n]/.test(svg.replace(/<[^>]*>/g, ''))) {
        problems.push('tiene texto fuera de las etiquetas');
    }

    const open = [];

    tags.forEach((tag, index) => {
        const match = TAG_SHAPE.exec(tag);

        if (!match) {
            problems.push(`etiqueta con formato no admitido: ${tag.slice(0, 40)}`);

            return;
        }

        const [, closing, name, rawAttributes, selfClosing] = match;
        const isRoot = index === 0;

        if (closing) {
            if (open.pop() !== name) {
                problems.push(`cierre sin apertura: </${name}>`);
            }

            return;
        }

        if (isRoot ? name !== 'svg' : !SHAPES.has(name)) {
            problems.push(isRoot ? 'no empieza con <svg>' : `elemento no admitido: <${name}>`);
        }

        const allowed = isRoot ? ROOT_ATTRIBUTES : SHAPE_ATTRIBUTES;
        const attributes = new Map();

        for (const [, attribute, value] of rawAttributes.matchAll(/([\w:-]+)="([^"]*)"/g)) {
            attributes.set(attribute, value);

            if (!allowed.has(attribute)) {
                problems.push(`atributo no admitido en <${name}>: ${attribute}`);
            } else if (!SAFE_VALUE.test(value) && attribute !== 'xmlns') {
                problems.push(`valor no admitido en ${attribute} de <${name}>`);
            }
        }

        if (isRoot && attributes.get('viewBox') !== VIEW_BOX) {
            problems.push(`el viewBox no es «${VIEW_BOX}»`);
        }

        if (isRoot && attributes.get('xmlns') !== 'http://www.w3.org/2000/svg') {
            problems.push('falta el xmlns de SVG');
        }

        if (!selfClosing) {
            open.push(name);
        }
    });

    if (open.length > 0) {
        problems.push(`etiquetas sin cerrar: ${open.join(', ')}`);
    }

    if (tags.at(-1) !== '</svg>') {
        problems.push('no termina con </svg>');
    }

    return [...new Set(problems)];
}

/**
 * Lee y valida la forma del manifiesto. Los sha256 y el commit pueden faltar
 * (ícono recién agregado, tag recién cambiado): los completa la sincronización.
 */
function readManifest(dir) {
    const file = path.join(dir, MANIFEST_FILE);

    if (!existsSync(file)) {
        throw new Error(`No existe ${file}`);
    }

    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const problems = [];

    if (!isRecord(manifest) || !isRecord(manifest.icons) || !isRecord(manifest.license)) {
        throw new Error(`${MANIFEST_FILE}: faltan «icons» o «license»`);
    }

    if (typeof manifest.repository !== 'string' || !REPOSITORY.test(manifest.repository)) {
        problems.push('«repository» debe ser dueño/repositorio');
    }

    if (typeof manifest.tag !== 'string' || !TAG.test(manifest.tag)) {
        problems.push('«tag» debe ser una versión fija (vX.Y.Z)');
    }

    if (manifest.commit !== undefined && !(typeof manifest.commit === 'string' && COMMIT.test(manifest.commit))) {
        problems.push('«commit» debe ser un SHA completo de 40 caracteres');
    }

    if (manifest.license.path !== LICENSE_FILE) {
        problems.push(`«license.path» debe ser ${LICENSE_FILE}`);
    }

    const entries = [['license', manifest.license], ...Object.entries(manifest.icons)];

    for (const [name, entry] of entries) {
        if (!isRecord(entry) || typeof entry.path !== 'string') {
            problems.push(`«${name}» no tiene «path»`);
            continue;
        }

        if (entry.sha256 !== undefined && !(typeof entry.sha256 === 'string' && SHA256.test(entry.sha256))) {
            problems.push(`«${name}»: sha256 con formato inválido`);
        }
    }

    for (const [name, entry] of Object.entries(manifest.icons)) {
        if (!ICON_NAME.test(name)) {
            problems.push(`«${name}» no es un nombre válido (minúsculas, números y guiones)`);
        }

        if (isRecord(entry) && typeof entry.path === 'string' && !ICON_PATH.test(entry.path)) {
            problems.push(`«${name}»: la ruta de origen debe ser icons/svg/<categoría>/<archivo>.svg`);
        }
    }

    if (Object.keys(manifest.icons).length === 0) {
        problems.push('«icons» está vacío');
    }

    if (problems.length > 0) {
        throw new Error(`${MANIFEST_FILE} inválido:\n  - ${problems.join('\n  - ')}`);
    }

    return manifest;
}

/** SVG de la carpeta que el manifiesto no menciona: entrarían al bundle sin verificar. */
function orphans(dir, manifest) {
    return readdirSync(dir)
        .filter((file) => file.endsWith('.svg'))
        .filter((file) => !Object.hasOwn(manifest.icons, file.slice(0, -'.svg'.length)));
}

/**
 * Lo que la sincronización tiene que quitar de la carpeta antes de escribir
 * `targets`. Los nombres se comparan sin distinguir mayúsculas: en Windows y
 * macOS «Sol.svg» y «sol.svg» son el mismo archivo, y borrar uno después de
 * escribir el otro lo perdería.
 *
 * @param {string} dir
 * @param {string[]} targets archivos que se van a escribir
 * @returns {{ stale: string[], removed: string[], blocked: string[] }}
 *   `stale`: archivos por borrar (SVG que sobran y nombres que solo difieren en
 *   mayúsculas); `removed`: de esos, los que no se vuelven a escribir;
 *   `blocked`: carpetas o enlaces en el lugar de un archivo.
 */
function leftovers(dir, targets) {
    const exact = new Set(targets);
    const folded = new Set(targets.map((file) => file.toLowerCase()));
    const stale = [];
    const blocked = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const name = entry.name.toLowerCase();

        if (!folded.has(name) && !name.endsWith('.svg')) {
            continue;
        }

        if (!entry.isFile()) {
            blocked.push(entry.name);
        } else if (!exact.has(entry.name)) {
            stale.push(entry.name);
        }
    }

    stale.sort();
    blocked.sort();

    return { stale, removed: stale.filter((file) => !folded.has(file.toLowerCase())), blocked };
}

/**
 * Compara lo versionado con el manifiesto, sin red y sin escribir.
 *
 * @returns {string[]} problemas encontrados
 */
function check(dir) {
    const manifest = readManifest(dir);
    const problems = [];

    if (manifest.commit === undefined) {
        problems.push('el manifiesto no tiene «commit»: ejecutá npm run icons:sync');
    }

    const files = [
        [LICENSE_FILE, manifest.license, false],
        ...Object.entries(manifest.icons).map(([name, entry]) => [`${name}.svg`, entry, true]),
    ];

    for (const [file, entry, isIcon] of files) {
        const target = path.join(dir, file);

        if (!existsSync(target)) {
            problems.push(`${file}: está en el manifiesto pero no en la carpeta`);
            continue;
        }

        const content = readFileSync(target, 'utf8');

        if (entry.sha256 === undefined) {
            problems.push(`${file}: sin sha256 en el manifiesto`);
        } else if (sha256(content) !== entry.sha256) {
            problems.push(`${file}: el sha256 no coincide con el manifiesto`);
        }

        if (isIcon) {
            problems.push(...validateSvg(content).map((problem) => `${file}: ${problem}`));
        }
    }

    problems.push(...orphans(dir, manifest).map((file) => `${file}: está en la carpeta pero no en el manifiesto`));

    return problems;
}

/**
 * Una petición a GitHub sin seguir redirecciones: lo que se copia sale de la
 * dirección pedida o de ninguna. api.github.com y raw.githubusercontent.com
 * responden directo; una redirección (el repositorio cambió de nombre o de
 * dueño) es un cambio de origen que se decide a mano en el manifiesto.
 */
async function request(fetch, url, headers = {}) {
    try {
        return await fetch(url, {
            headers: { 'User-Agent': 'veni-roldanillo-icons-sync', ...headers },
            redirect: 'error',
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';

        throw new Error(`No se pudo pedir ${url}: ${reason}${cause}`, { cause: error });
    }
}

async function download(fetch, url) {
    const response = await request(fetch, url);

    return { status: response.status, body: await response.text() };
}

/** Commit al que apunta hoy el tag: un tag se puede mover, un commit no. */
async function resolveTag(fetch, repository, tag) {
    const response = await request(fetch, `https://api.github.com/repos/${repository}/commits/refs/tags/${tag}`, {
        Accept: 'application/vnd.github.sha',
    });
    const body = (await response.text()).trim();

    if (!response.ok || !COMMIT.test(body)) {
        throw new Error(`No se pudo resolver el tag ${tag} de ${repository} (HTTP ${String(response.status)})`);
    }

    return body;
}

/**
 * Descarga la licencia y los íconos del manifiesto desde el commit del tag y,
 * solo si todo es válido, escribe los archivos y el manifiesto.
 *
 * @param {string} dir
 * @param {{ update?: boolean, fetch?: typeof globalThis.fetch }} [options] «fetch» lo cambian las pruebas.
 * @returns {Promise<{ problems: string[], summary: string, changes: string[] }>}
 *   `changes`: lo que quedó distinto de lo que decía el manifiesto, para revisarlo.
 */
async function sync(dir, { update = false, fetch = globalThis.fetch } = {}) {
    const manifest = readManifest(dir);
    const commit = await resolveTag(fetch, manifest.repository, manifest.tag);
    const problems = [];

    if (manifest.commit !== undefined && manifest.commit !== commit && !update) {
        return {
            problems: [
                `el tag ${manifest.tag} apunta a ${commit} y el manifiesto dice ${manifest.commit}. ` +
                    'Si cambiaste «tag» a propósito, repetí con --update y revisá los cambios que informa. ' +
                    'Si no lo cambiaste, el tag se movió en el origen: no lo aceptes sin revisar allá qué cambió',
            ],
            summary: '',
            changes: [],
        };
    }

    const base = `https://raw.githubusercontent.com/${manifest.repository}/${commit}`;
    const files = [
        [LICENSE_FILE, manifest.license, false],
        ...Object.entries(manifest.icons).map(([name, entry]) => [`${name}.svg`, entry, true]),
    ];

    const downloads = await Promise.all(
        files.map(async ([file, entry, isIcon]) => {
            const { status, body } = await download(fetch, `${base}/${entry.path}`);

            if (status === 404) {
                problems.push(`${file}: ${entry.path} no existe en ${manifest.tag}`);

                return null;
            }

            if (status !== 200) {
                problems.push(`${file}: HTTP ${String(status)} al descargar ${entry.path}`);

                return null;
            }

            const content = normalize(body);
            const hash = sha256(content);

            if (isIcon) {
                problems.push(...validateSvg(content).map((problem) => `${file}: ${problem}`));
            }

            if (entry.sha256 !== undefined && entry.sha256 !== hash && !update) {
                problems.push(`${file}: el sha256 descargado no coincide con el manifiesto (--update lo acepta)`);
            }

            return { file, entry, content, hash };
        }),
    );

    // La carpeta se mira antes de tocarla: lo que estorba se informa aquí, no a medio escribir.
    const { stale, removed, blocked } = leftovers(
        dir,
        files.map(([file]) => file),
    );

    problems.push(...blocked.map((file) => `${file}: no es un archivo (es una carpeta o un enlace): quitalo a mano`));

    if (problems.length > 0) {
        return { problems, summary: '', changes: [] };
    }

    for (const file of stale) {
        rmSync(path.join(dir, file));
    }

    const changes = [];
    const added = [];
    let bytes = 0;

    if (manifest.commit !== undefined && manifest.commit !== commit) {
        changes.push(`commit de ${manifest.tag}: ${manifest.commit} → ${commit}`);
    }

    for (const { file, entry, content, hash } of downloads) {
        writeFileSync(path.join(dir, file), content);

        if (entry.sha256 === undefined) {
            added.push(`nuevo: ${file}`);
        } else if (entry.sha256 !== hash) {
            changes.push(`cambió: ${file}`);
        }

        entry.sha256 = hash;
        bytes += file === LICENSE_FILE ? 0 : Buffer.byteLength(content);
    }

    changes.push(...added, ...removed.map((file) => `quitado: ${file}`));

    const sorted = Object.fromEntries(
        Object.entries(manifest.icons)
            .sort(([a], [b]) => a.localeCompare(b, 'en'))
            .map(([name, entry]) => [name, { path: entry.path, sha256: entry.sha256 }]),
    );
    const written = {
        repository: manifest.repository,
        tag: manifest.tag,
        commit,
        license: { path: manifest.license.path, sha256: manifest.license.sha256 },
        icons: sorted,
    };

    writeFileSync(path.join(dir, MANIFEST_FILE), `${JSON.stringify(written, null, 4)}\n`);

    const count = Object.keys(sorted).length;

    return {
        problems: [],
        summary: `${String(count)} íconos de ${manifest.repository} ${manifest.tag} (${commit.slice(0, 7)}), ${String(bytes)} bytes`,
        changes,
    };
}

/**
 * Procedencia: descarga cada archivo del manifiesto desde el commit fijado y lo
 * compara con el de la carpeta, sin escribir. Que el sha256 coincida con el
 * manifiesto no alcanza: quien cambia un archivo puede cambiar también su sha256.
 *
 * @param {string} dir
 * @param {{ fetch?: typeof globalThis.fetch }} [options] «fetch» lo cambian las pruebas.
 * @returns {Promise<string[]>} problemas encontrados
 */
async function verify(dir, { fetch = globalThis.fetch } = {}) {
    const manifest = readManifest(dir);

    if (manifest.commit === undefined) {
        return ['el manifiesto no tiene «commit»: ejecutá npm run icons:sync'];
    }

    const base = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.commit}`;
    const files = [
        [LICENSE_FILE, manifest.license],
        ...Object.entries(manifest.icons).map(([name, entry]) => [`${name}.svg`, entry]),
    ];

    const problems = await Promise.all(
        files.map(async ([file, entry]) => {
            const target = path.join(dir, file);

            if (!existsSync(target)) {
                return `${file}: está en el manifiesto pero no en la carpeta`;
            }

            const { status, body } = await download(fetch, `${base}/${entry.path}`);

            if (status !== 200) {
                return `${file}: HTTP ${String(status)} al descargar ${entry.path} del commit ${manifest.commit}`;
            }

            return normalize(body) === readFileSync(target, 'utf8')
                ? null
                : `${file}: no es igual a ${entry.path} en el commit ${manifest.commit}`;
        }),
    );

    return problems.filter((problem) => problem !== null);
}

async function main() {
    const { values } = parseArgs({
        options: {
            check: { type: 'boolean', default: false },
            verify: { type: 'boolean', default: false },
            update: { type: 'boolean', default: false },
            dir: { type: 'string', default: DEFAULT_DIR },
        },
    });
    const dir = path.resolve(values.dir);
    let problems;

    if (values.check) {
        problems = check(dir);

        if (problems.length === 0) {
            const manifest = readManifest(dir);
            console.log(
                `Íconos al día: ${String(Object.keys(manifest.icons).length)} de ${manifest.repository} ${manifest.tag}.`,
            );
        }
    } else if (values.verify) {
        problems = await verify(dir);

        if (problems.length === 0) {
            const manifest = readManifest(dir);
            const count = String(Object.keys(manifest.icons).length);
            console.log(
                `Íconos idénticos al origen: ${count} y la licencia, de ${manifest.repository} en ${manifest.commit}.`,
            );
        }
    } else {
        const result = await sync(dir, { update: values.update });
        problems = result.problems;

        if (problems.length === 0) {
            console.log(`Sincronizado: ${result.summary}.`);

            if (result.changes.length > 0) {
                console.log(`Cambios:\n  - ${result.changes.join('\n  - ')}`);
            }
        }
    }

    if (problems.length > 0) {
        console.error(`Íconos: ${String(problems.length)} problema(s) en ${dir}\n  - ${problems.join('\n  - ')}`);
        process.exitCode = 1;
    }
}

/** Solo al ejecutarlo con Node: las pruebas lo importan para llamar a sus funciones. */
function isMain() {
    const entry = process.argv[1];

    return entry !== undefined && existsSync(entry) && import.meta.url === pathToFileURL(realpathSync(entry)).href;
}

if (isMain()) {
    try {
        await main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}

export { sync, verify };
