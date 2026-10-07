// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { ViteManifest } from './shellPrecache';
import { keepShell, OFFLINE_PAGE_SOURCES, offlineRevision, staticFiles } from './shellPrecache';

/** Como el de `npm run build`: la entrada, la página de inicio y el mapa, que la página pide con import(). */
const manifest: ViteManifest = {
    'resources/js/app.ts': {
        file: 'assets/app-A.js',
        css: ['assets/app-A.css'],
        imports: ['_preload-helper-B.js'],
        assets: ['assets/veni-wordmark-C.svg'],
    },
    '_preload-helper-B.js': { file: 'assets/preload-helper-B.js' },
    'resources/js/pages/Home.vue': {
        file: 'assets/Home-D.js',
        imports: ['resources/js/app.ts', '_preload-helper-B.js'],
        dynamicImports: ['resources/js/map/engine.ts'],
    },
    'resources/js/map/engine.ts': {
        file: 'assets/engine-E.js',
        css: ['assets/engine-E.css'],
        imports: ['_maplibre-gl-shared-F.js'],
        // Así queda el worker del mapa (shareMapWorkerCode en vite.config.ts).
        assets: ['assets/maplibre-gl-worker-!~{001}~.js'],
    },
    '_maplibre-gl-shared-F.js': { file: 'assets/maplibre-gl-shared-F.js' },
};

describe('archivos del shell', () => {
    it('la entrada y la página de inicio, con sus imports estáticos, CSS y assets', () => {
        expect(staticFiles(manifest, ['resources/js/app.ts', 'resources/js/pages/Home.vue'])).toEqual([
            'assets/Home-D.js',
            'assets/app-A.css',
            'assets/app-A.js',
            'assets/preload-helper-B.js',
            'assets/veni-wordmark-C.svg',
        ]);
    });

    it('no sigue los import(): el mapa queda fuera', () => {
        const files = staticFiles(manifest, ['resources/js/pages/Home.vue']);

        expect(files.filter((file) => /engine|maplibre/.test(file))).toEqual([]);
    });

    it('falla con una entrada que el manifest no tiene', () => {
        expect(() => staticFiles(manifest, ['resources/js/pages/NoExiste.vue'])).toThrow('NoExiste.vue');
    });
});

describe('precache del shell', () => {
    const fromBuild = [
        { url: '/build/assets/app-A.js', revision: null },
        { url: '/build/assets/engine-E.js', revision: null },
        { url: '/build/assets/Home-D.js', revision: null },
        { url: '/build/assets/arepa-G.js', revision: null },
    ];

    it('deja solo el shell de lo que hay en el directorio de build', () => {
        expect(keepShell(fromBuild, ['/build/assets/app-A.js', '/build/assets/Home-D.js']).map((entry) => entry.url)).toEqual([
            '/build/assets/app-A.js',
            '/build/assets/Home-D.js',
        ]);
    });

    it('falla si el shell nombra un archivo que no está en el build', () => {
        expect(() => keepShell(fromBuild, ['/build/assets/app-A.js', '/build/assets/maplibre-gl-worker-!~{001}~.js'])).toThrow(
            'maplibre-gl-worker-!~{001}~.js',
        );
    });
});

/*
| La página sin conexión la arma Laravel: si cambia algo de lo que la vista
| usa y su versión en el precache no, quien ya instaló la app se queda con la
| página vieja.
*/
describe('versión de la página sin conexión', () => {
    const shell = ['/build/assets/offline-A.js', '/build/assets/offline-B.css'];
    /** Cada archivo «contiene» su nombre; el que cambió, otra cosa. */
    const read =
        (changed?: string) =>
        (file: string): string =>
            file === changed ? `${file} (cambiado)` : file;

    it.each([
        ['la vista', 'resources/views/offline.blade.php'],
        ['los textos en español', 'lang/es.json'],
        ['los textos en inglés', 'lang/en.json'],
        // WebApp::themeColor() saca de aquí el color de la barra del sistema.
        ['los colores de la marca', 'brand/tokens.json'],
        ['el nombre de la app y qué color va con cada tema', 'app/Support/WebApp.php'],
        ['los idiomas de la app', 'app/Enums/Locale.php'],
    ])('cambia si cambian %s (%s)', (_name, file) => {
        expect(offlineRevision(shell, read(file))).not.toBe(offlineRevision(shell, read()));
    });

    it('cambia si cambia un archivo del build que la página nombra', () => {
        expect(offlineRevision(['/build/assets/offline-Z.js', '/build/assets/offline-B.css'], read())).not.toBe(offlineRevision(shell, read()));
    });

    it('con lo mismo, sale la misma', () => {
        expect(offlineRevision(shell, read())).toBe(offlineRevision([...shell], read()));
        expect(offlineRevision(shell, read())).toMatch(/^[0-9a-f]{16}$/);
    });

    it('todo lo que lee está en el repositorio y entra a la etapa de la imagen que compila', () => {
        const dockerfile = readFileSync('Dockerfile', 'utf8');
        const stage = dockerfile.slice(dockerfile.indexOf(' AS assets'), dockerfile.indexOf(' AS prod'));
        const copied = [...stage.matchAll(/^COPY (?!--from)(.+) \S+$/gm)].flatMap((line) => (line[1] ?? '').split(' '));

        for (const file of OFFLINE_PAGE_SOURCES) {
            expect(existsSync(file), file).toBe(true);
            expect(
                copied.some((source) => file === source || file.startsWith(`${source}/`)),
                `La etapa «assets» del Dockerfile no copia ${file}`,
            ).toBe(true);
        }
    });
});
