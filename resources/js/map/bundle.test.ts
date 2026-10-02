// @vitest-environment node
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

/*
| MapLibre GL y PMTiles pesan más de 1 MB: solo los descarga quien abre una
| pantalla con mapa (ADR 0007). Estas pruebas compilan el frontend de verdad,
| con vite.config.ts y sin escribir en disco, y miran cómo quedaron repartidos
| los módulos: fallan si alguien importa el motor del mapa de forma estática
| desde la entrada, el layout o una página.
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
}

const MAP_MODULES = /\/node_modules\/(?:maplibre-gl|pmtiles)\/|\/resources\/js\/map\/engine\.ts$/;

let chunks: Chunk[];

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

beforeAll(async () => {
    const result = await build({
        logLevel: 'silent',
        build: { write: false, minify: false, reportCompressedSize: false },
    });
    const outputs = Array.isArray(result) ? result : [result];

    chunks = outputs.flatMap((bundle) => ('output' in bundle ? bundle.output : [])).filter((file) => file.type === 'chunk');
}, 120_000);

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
});
