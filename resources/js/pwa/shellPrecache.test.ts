// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { ViteManifest } from './shellPrecache';
import { keepShell, staticFiles } from './shellPrecache';

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
