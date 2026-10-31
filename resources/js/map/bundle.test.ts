// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
| MapLibre GL y PMTiles pesan más de 1 MB: solo los descarga quien abre una
| pantalla con mapa (ADR 0007). Estas pruebas compilan el frontend de verdad,
| con vite.config.ts, como `npm run build` pero sin escribir en disco, y miran
| cómo quedaron repartidos los módulos y cuánto pesan: fallan si alguien
| importa el motor del mapa de forma estática desde la entrada, el layout o
| una página, si el worker de MapLibre deja de poder cargarse o si lo que se
| descarga crece más de la cuenta.
*/

interface Chunk {
    type: 'chunk';
    fileName: string;
    isEntry: boolean;
    facadeModuleId: string | null;
    /** Chunks que se cargan junto con este (imports estáticos). */
    imports: string[];
    /** Chunks que se cargan después, con import(). */
    dynamicImports: string[];
    moduleIds: string[];
    code: string;
    /** Lo que anota Vite: las hojas de estilo que se cargan con el chunk. */
    viteMetadata?: { importedCss: Set<string> };
}

interface Asset {
    type: 'asset';
    fileName: string;
    source: string | Uint8Array;
}

/** Una entrada del manifest de Vite (public/build/manifest.json). */
interface ManifestEntry {
    file: string;
    css?: string[];
    imports?: string[];
    dynamicImports?: string[];
    assets?: string[];
}

const MAP_MODULES = /\/node_modules\/(?:maplibre-gl|pmtiles)\/|\/resources\/js\/map\/engine\.ts$/;

/** Así deja Rolldown el nombre de un archivo mientras todavía no calculó su hash. */
const UNRESOLVED_HASH = /!~\{[^}]+\}~/;

let chunks: Chunk[];
let assets: Asset[];

function normalize(id: string): string {
    return id.replaceAll('\\', '/');
}

function has(chunk: Chunk, pattern: RegExp): boolean {
    return chunk.moduleIds.some((id) => pattern.test(normalize(id)));
}

function chunkOf(source: string): Chunk {
    const found = chunks.find((chunk) => chunk.facadeModuleId !== null && normalize(chunk.facadeModuleId).endsWith(source));

    if (!found) {
        throw new Error(`No hay un chunk para ${source}`);
    }

    return found;
}

/** El chunk y todo lo que el navegador descarga con él sin que nadie lo pida: sus imports estáticos, en cadena. */
function loadedWith(start: Chunk): Chunk[] {
    const seen = new Map<string, Chunk>();
    const queue = [start];

    for (let chunk = queue.pop(); chunk; chunk = queue.pop()) {
        if (seen.has(chunk.fileName)) {
            continue;
        }

        seen.set(chunk.fileName, chunk);
        queue.push(...chunks.filter((candidate) => chunk.imports.includes(candidate.fileName)));
    }

    return [...seen.values()];
}

/** Lo que baja al abrir la app, antes de pedir nada con import(): la entrada y la página de inicio. */
function initialChunks(): Chunk[] {
    return [...new Set([...loadedWith(chunkOf('/resources/js/app.ts')), ...loadedWith(chunkOf('/resources/js/pages/Home.vue'))])];
}

/** Los chunks y las hojas de estilo que se cargan con ellos, sin repetir. */
function withStyles(loaded: Chunk[]): (Chunk | Asset)[] {
    const styles = new Set(loaded.flatMap((chunk) => [...(chunk.viteMetadata?.importedCss ?? [])]));

    return [...loaded, ...assets.filter((asset) => styles.has(asset.fileName))];
}

/** Lo que pesa por la red: cada archivo comprimido con gzip, en kB. */
function gzipKb(files: (Chunk | Asset)[]): number {
    const bytes = files.reduce((total, file) => total + gzipSync(file.type === 'chunk' ? file.code : file.source).length, 0);

    return bytes / 1000;
}

beforeAll(async () => {
    // La compilación no depende del .env de quien corre las pruebas.
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.test/style/veni-{theme}-{locale}.json');
    // Vitest corre con NODE_ENV=test y Vite lo respetaría: Vue saldría con su
    // código de desarrollo y los pesos no serían los de `npm run build`.
    vi.stubEnv('NODE_ENV', 'production');

    const result = await build({
        logLevel: 'silent',
        build: { write: false, reportCompressedSize: false },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const files = outputs.flatMap((bundle) => ('output' in bundle ? bundle.output : []));

    chunks = files.filter((file) => file.type === 'chunk');
    assets = files.filter((file) => file.type === 'asset');
    vi.unstubAllEnvs();
}, 120_000);

afterAll(() => {
    vi.unstubAllEnvs();
});

describe('reparto del bundle', () => {
    it('la entrada de la app no trae MapLibre ni PMTiles', () => {
        const initial = loadedWith(chunkOf('/resources/js/app.ts'));

        expect(initial.length).toBeGreaterThan(0);
        expect(initial.filter((chunk) => has(chunk, MAP_MODULES)).map((chunk) => chunk.fileName)).toEqual([]);
    });

    it('la página de inicio, que la vista raíz carga con la entrada, tampoco', () => {
        const home = loadedWith(chunkOf('/resources/js/pages/Home.vue'));

        // La prueba mira la página correcta: MapView va dentro de ese chunk.
        expect(home.some((chunk) => has(chunk, /\/resources\/js\/components\/MapView\.vue/))).toBe(true);
        expect(home.filter((chunk) => has(chunk, MAP_MODULES)).map((chunk) => chunk.fileName)).toEqual([]);
    });

    it('el motor del mapa es un chunk que la página pide con import()', () => {
        const engine = chunkOf('/resources/js/map/engine.ts');
        const home = chunkOf('/resources/js/pages/Home.vue');

        expect(home.dynamicImports).toContain(engine.fileName);
        expect(loadedWith(engine).some((chunk) => has(chunk, /\/node_modules\/maplibre-gl\/dist\/maplibre-gl\.mjs$/))).toBe(true);
        expect(loadedWith(engine).some((chunk) => has(chunk, /\/node_modules\/pmtiles\//))).toBe(true);
    });

    it('el carrito es un chunk que la ficha pide con import() al tocar la barra del pedido (ADR 0024)', () => {
        const cart = chunkOf('/resources/js/components/OrderCart.vue');
        const show = loadedWith(chunkOf('/resources/js/pages/Restaurants/Show.vue'));

        expect(show.filter((chunk) => has(chunk, /\/resources\/js\/components\/OrderCart\.vue/)).map((chunk) => chunk.fileName)).toEqual([]);
        expect(show.some((chunk) => chunk.dynamicImports.includes(cart.fileName))).toBe(true);
    });

    it('el worker de MapLibre no repite el código que comparte con el hilo principal', () => {
        const shared = chunks.filter((chunk) => has(chunk, /\/maplibre-gl-shared\.mjs$/));
        const worker = chunkOf('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
        const engine = chunkOf('/resources/js/map/engine.ts');

        expect(shared).toHaveLength(1);
        expect(worker.imports).toContain(shared[0]?.fileName);
        expect(engine.imports).toContain(shared[0]?.fileName);
        // El motor le da a MapLibre la URL de ese chunk (setWorkerUrl).
        expect(engine.code).toContain(worker.fileName);
    });

    it('la entrada trae lo que abre como página el error de una visita: no es solo de desarrollo', () => {
        const initial = loadedWith(chunkOf('/resources/js/app.ts'));

        expect(initial.some((chunk) => has(chunk, /\/resources\/js\/visitErrors\.ts$/))).toBe(true);
    });
});

/*
| vite.config.ts (shareMapWorkerCode) saca el worker de MapLibre del mismo
| grafo que la app, para no repetir el código que comparten. El riesgo de
| compartir grafo es que al worker se le cuele código pensado para la página:
| en un worker no existen `window` ni `document`, y uno que falla al cargar
| deja el mapa sin tiles.
*/
describe('worker de MapLibre', () => {
    it('solo trae el código que comparte con el hilo principal y el ayudante de import() de Vite', () => {
        const worker = chunkOf('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
        const expected = chunks.filter((chunk) => has(chunk, /\/maplibre-gl-shared\.mjs$|vite\/preload-helper/)).map((chunk) => chunk.fileName);

        // El ayudante llega porque MapLibre usa import() en el worker
        // (importScriptInWorkers, que la app no usa). Solo toca `document`
        // si ese import() trae CSS o chunks que precargar, y aquí no los trae.
        expect(expected).toHaveLength(2);
        expect([...worker.imports].sort()).toEqual([...expected].sort());
        expect(worker.dynamicImports).toEqual([]);
        expect(
            loadedWith(worker)
                .map((chunk) => chunk.fileName)
                .sort(),
        ).toEqual([worker.fileName, ...expected].sort());
        // Ni el worker ni lo que arrastra traen código de la app.
        expect(loadedWith(worker).filter((chunk) => has(chunk, /\/resources\/js\//)).map((chunk) => chunk.fileName)).toEqual([]);
    });

    it('se evalúa sin window ni document, como en un worker de verdad', () => {
        const worker = chunkOf('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
        const directory = mkdtempSync(join(tmpdir(), 'veni-worker-'));

        try {
            for (const chunk of loadedWith(worker)) {
                mkdirSync(dirname(join(directory, chunk.fileName)), { recursive: true });
                writeFileSync(join(directory, chunk.fileName), chunk.code);
            }

            // Node no tiene window ni document. Le falta `self`: aquí, el
            // ámbito global mínimo de un worker, para que MapLibre arranque.
            writeFileSync(
                join(directory, 'evaluate.mjs'),
                [
                    'class WorkerGlobalScope extends EventTarget { postMessage() {} }',
                    'globalThis.WorkerGlobalScope = WorkerGlobalScope;',
                    'globalThis.self = new WorkerGlobalScope();',
                    'await import(process.argv[2]);',
                    'console.log(JSON.stringify({ window: typeof window, document: typeof document, worker: typeof self.worker }));',
                    // El worker de MapLibre queda escuchando: sin esto el proceso no termina.
                    'process.exit(0);',
                ].join('\n'),
            );

            const output = execFileSync(process.execPath, [join(directory, 'evaluate.mjs'), pathToFileURL(join(directory, worker.fileName)).href], {
                encoding: 'utf8',
                timeout: 30_000,
            });

            // Cargó sin tocar la página y MapLibre creó su worker (self.worker).
            expect(JSON.parse(output)).toEqual({ window: 'undefined', document: 'undefined', worker: 'object' });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('MapLibre sigue avisando que su worker no cargó con el mensaje que el motor reconoce', () => {
        // resources/js/map/engine.ts (WORKER_ERROR) lo distingue por el
        // comienzo del mensaje: MapLibre no le pone otra seña a ese error.
        expect(chunks.filter((chunk) => chunk.code.includes('Worker failed to load')).map((chunk) => chunk.fileName)).toEqual([
            chunkOf('/resources/js/map/engine.ts').fileName,
        ]);
    });

    it('lo que Laravel lee del manifest no trae nombres con el hash sin resolver', () => {
        const manifest = assets.find((asset) => asset.fileName === 'manifest.json');
        const entries = Object.values(JSON.parse(String(manifest?.source)) as Record<string, ManifestEntry>);

        expect(entries.length).toBeGreaterThan(0);
        // Laravel (Illuminate\Foundation\Vite) arma las etiquetas con `file`,
        // `css`, `imports` y `dynamicImports`.
        expect(
            entries
                .flatMap((entry) => [entry.file, ...(entry.css ?? []), ...(entry.imports ?? []), ...(entry.dynamicImports ?? [])])
                .filter((name) => UNRESOLVED_HASH.test(name)),
        ).toEqual([]);
        // En `assets` del motor sí queda `assets/maplibre-gl-worker-!~{…}~.js`:
        // Vite anota ahí la referencia que emite shareMapWorkerCode antes de
        // que Rolldown calcule el hash. Laravel no lee `assets`. Quien necesite
        // la lista de archivos (el precache de la PWA, #5) la saca del
        // directorio public/build/assets, no del manifest.
        expect(entries.flatMap((entry) => entry.assets ?? []).filter((name) => UNRESOLVED_HASH.test(name) && !name.includes('maplibre-gl-worker'))).toEqual(
            [],
        );
    });
});

/*
| La página sin conexión (#5) carga resources/js/offline.ts como script
| clásico en <head>, para elegir idioma y tema antes de pintar: un import o un
| export ahí sería un error de sintaxis y la página saldría sin idioma.
*/
describe('página sin conexión', () => {
    it('su script es un solo archivo sin import ni export', () => {
        const offline = chunkOf('/resources/js/offline.ts');

        expect(offline.imports).toEqual([]);
        expect(offline.dynamicImports).toEqual([]);
        expect(offline.code).not.toMatch(/^\s*(?:import|export)\b|\bimport\s*\(/m);
    });

    it('pesa menos de 1 kB comprimido', () => {
        expect(gzipKb([chunkOf('/resources/js/offline.ts')])).toBeLessThan(1);
    });
});

/*
| Regla 8 de producto: la app tiene que servir con datos móviles y mala señal.
| El límite de Vite (chunkSizeWarningLimit) solo avisa, y por archivo: estos
| presupuestos fallan, y miden lo que de verdad viaja (gzip). Si una prueba de
| estas falla, o sobra algo en el bundle o el presupuesto se sube a conciencia,
| en el mismo cambio que lo justifica.
*/
describe('presupuesto de descarga', () => {
    it('el arranque (entrada, página de inicio y sus estilos) no pasa de 83 kB comprimidos', () => {
        // Medido al fijarlo en 80: 70 kB (Vue e Inertia son casi todo). Con
        // los restaurantes sobre el mapa (#9) llegó a 79, y con la ficha (#13),
        // a 80,5: de los 1,5 kB que suma, 0,6 son sus estilos, porque el CSS
        // de Tailwind es uno solo para todas las páginas, y el resto, los
        // enlaces del mapa a la ficha y el restaurante elegido en la dirección.
        // El código de la ficha no cuenta: es un chunk aparte que baja al abrirla.
        // Antes de «¿Dónde estoy?» (#10) medía 81,7, y con él, 81,9: el botón y
        // sus avisos viajan con el mapa (DOM y estilos del control, no
        // componentes ni clases de Tailwind); al arranque solo llegan sus
        // textos y el panel que la página le pasa al mapa.
        // «Cómo llegar» (#11) lo subió a 83 (ADR 0020): medía 82,6. El
        // router, el grafo, la capa y el panel de la ruta bajan al pedir la
        // primera; al arranque llegan el botón, el restaurante elegido en la
        // dirección y lo que carga lo demás. Para hacerle lugar, los colores
        // de la marca se importan solos y no todo brand/tokens.json (−0,2).
        // La próxima vez que no alcance, antes de subirlo: sacar del arranque
        // lo de «Cómo llegar» que sigue en él (el estado de la ruta y el aviso
        // sin señal de Home.vue, el restaurante elegido en la dirección) a
        // un chunk que baje con el resumen, y medir de nuevo. Solo si con eso
        // no alcanza se sube, con un ADR que diga qué se sumó. Los textos
        // (directions.* y los demás) no cuentan aquí: llegan con la página,
        // en las props de Inertia; recortarlos es otra cuenta, la del HTML.
        // Con el panel de abajo del celular (#81) no alcanzaba: se hizo lo de
        // arriba (ADR 0022). El resumen (con «Cómo llegar» y su aviso sin
        // señal) y la lista bajan aparte, apenas monta el inicio, y el
        // arranque bajó de 82,9 a 80,4 antes de sumar el panel; con él y
        // lo demás de #81, 82,5. Con los créditos de OpenStreetMap (#58) llegó
        // a 83,2: la capa de los restaurantes sobre el mapa, que no se ve
        // hasta que llega MapLibre, pasó a bajar con él (81,7).
        // Con la búsqueda y los filtros (#12, ADR 0028), medido así: 82,4 antes
        // y 82,7 después. Se aplicó la regla antes de sumar: el aviso sin señal
        // de «Cómo llegar» pasó de Home.vue al resumen, y filtrar, buscar,
        // sortear, leer y escribir los filtros de la dirección, los almuerzos
        // y los botones de la bienvenida bajan con la lista. Al arranque llegan
        // el estado de los filtros, su paso a la dirección y lo que carga lo demás.
        // Con los platos (#17, ADR 0029): 82,71 antes y 82,73 después. La
        // sección, la petición y su estado bajan con la lista; al arranque
        // solo llegan las clases nuevas de Tailwind en el CSS de siempre.
        // Con los documentos legales (#23) quedó en 82,985. La guía de platos
        // (#21), como toda página nueva, suma una entrada al registro de
        // páginas de app.ts (83,007 solo con eso); su enlace baja con los
        // documentos legales (LegalLinks) y no con el arranque, y el registro
        // se achicó (claves sin «./pages» y un error más corto): 82,98.
        // Abrir la lista cuando la dirección trae una búsqueda (#21) la
        // decide la bienvenida, que baja con la lista: en Home.vue solo queda
        // escuchar su aviso (82,99). Hacerlo en Home.vue lo pasaba (83,02).
        //
        // Quedan menos de 10 bytes (los hashes de los chunks que se piden con
        // import() mueven unos pocos). Desde acá la regla es esta: la próxima
        // página (su entrada en el registro de app.ts) o lo próximo que sume
        // al arranque tiene que sacar antes algo de él, en el mismo cambio, y
        // medirlo aquí; si no hay qué sacar, se abre una decisión (un ADR) y
        // recién entonces se sube el presupuesto. No se sube para que entre.
        expect(gzipKb(withStyles(initialChunks()))).toBeLessThan(83);
    });

    it('el resumen y la lista (con sus distancias, la búsqueda, los filtros, los almuerzos y los platos) no bajan con el arranque: el inicio los pide con import() apenas monta', () => {
        const initial = initialChunks();
        const panels =
            /\/resources\/js\/(?:components\/(?:Restaurant(?:Summary|List|Distances|Filters)|TodaysLunches|WelcomeActions|DishResults)\.vue|restaurants\/(?:openStatus|statusText|distance|finder|filterParams|dishSearch|useDishSearch)\.ts)$/;

        expect(initial.filter((chunk) => has(chunk, panels))).toEqual([]);
        expect(chunkOf('/resources/js/pages/Home.vue').dynamicImports).toEqual(
            expect.arrayContaining([chunkOf('/resources/js/components/RestaurantSummary.vue').fileName, chunkOf('/resources/js/components/RestaurantList.vue').fileName]),
        );
    });

    it('los restaurantes sobre el mapa no bajan con el arranque: el inicio pide su capa con import() apenas monta, junto con el motor', () => {
        const initial = initialChunks();
        // useMapLayers.ts no: MapView da con él el mapa a lo que va encima.
        const layer = /\/resources\/js\/(?:components\/RestaurantsLayer\.vue|map\/iconImage\.ts)/;

        expect(initial.filter((chunk) => has(chunk, layer)).map((chunk) => chunk.fileName)).toEqual([]);
        expect(chunkOf('/resources/js/pages/Home.vue').dynamicImports).toContain(chunkOf('/resources/js/components/RestaurantsLayer.vue').fileName);
    });

    it('la ruta (router, grafo, capa y panel) no baja con el arranque: son chunks que se piden con import()', () => {
        const initial = initialChunks();
        const route = /\/resources\/js\/(?:routing\/|components\/Route(?:Layer|Directions)\.vue)/;

        expect(initial.filter((chunk) => chunk.moduleIds.some((id) => route.test(normalize(id)) && !normalize(id).endsWith('/routing/intent.ts')))).toEqual([]);
        expect(chunkOf('/resources/js/pages/Home.vue').dynamicImports).toEqual(
            expect.arrayContaining([chunkOf('/resources/js/components/RouteLayer.vue').fileName, chunkOf('/resources/js/components/RouteDirections.vue').fileName]),
        );
        expect(loadedWith(chunkOf('/resources/js/components/RouteLayer.vue')).some((chunk) => has(chunk, /\/resources\/js\/routing\/veni-mapa\/router\.ts$/))).toBe(true);
    });

    it('la ficha de un restaurante no baja con el arranque: es un chunk aparte', () => {
        const show = chunkOf('/resources/js/pages/Restaurants/Show.vue');

        expect(initialChunks()).not.toContain(show);
        // Los formatos de precios y fechas son de la ficha: no viajan con el inicio.
        expect(show.code + loadedWith(show).map((chunk) => chunk.code).join('')).toMatch(/currency:\s*["'`]COP/);
        expect(initialChunks().some((chunk) => /currency:\s*["'`]COP/.test(chunk.code))).toBe(false);
    });

    it('el mapa (motor, MapLibre, PMTiles, worker y sus estilos) no pasa de 340 kB comprimidos', () => {
        const map = new Set([
            ...loadedWith(chunkOf('/resources/js/map/engine.ts')),
            ...loadedWith(chunkOf('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')),
        ]);
        const initial = initialChunks();

        // Medido al fijarlo: 314 kB (MapLibre GL 6.11 es casi todo). Lo que
        // ya bajó con el arranque no se cuenta dos veces.
        expect(gzipKb(withStyles([...map].filter((chunk) => !initial.includes(chunk))))).toBeLessThan(340);
    });
});
