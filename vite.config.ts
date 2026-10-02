import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import laravel from 'laravel-vite-plugin';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const MAP_WORKER = 'maplibre-gl/dist/maplibre-gl-worker.mjs';

/**
 * El worker de MapLibre comparte casi todo su código con el hilo principal
 * (maplibre-gl-shared.mjs, unos 510 kB). Vite compila cada worker como un
 * bundle aparte, así que ese código quedaría dos veces en lo que descarga
 * quien abre el mapa. Al compilar, este plugin resuelve el import
 * `…/maplibre-gl-worker.mjs?worker&url` de resources/js/map/engine.ts
 * emitiendo el worker como un chunk del mismo grafo: lo compartido queda en un
 * solo archivo, que usan los dos (lo vigila resources/js/map/bundle.test.ts).
 *
 * Solo actúa en `vite build`. En desarrollo y en Vitest ese import lo atiende
 * Vite como cualquier worker; sin este plugin el mapa funciona igual, con más
 * peso.
 */
function shareMapWorkerCode(): Plugin {
    const resolvedId = `\0${MAP_WORKER}?url`;

    return {
        name: 'veni:share-map-worker-code',
        apply: 'build',
        enforce: 'pre',
        resolveId(source) {
            return source === `${MAP_WORKER}?worker&url` ? resolvedId : null;
        },
        load(id) {
            if (id !== resolvedId) {
                return null;
            }

            const reference = this.emitFile({ type: 'chunk', id: MAP_WORKER });

            return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
        },
    };
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.ts'],
            refresh: true,
        }),
        vue(),
        tailwindcss(),
        shareMapWorkerCode(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
            '@brand': fileURLToPath(new URL('./brand', import.meta.url)),
        },
    },
    build: {
        // Los dos chunks de MapLibre (su código y el que comparte con el worker)
        // rondan los 570 kB y solo se descargan al abrir un mapa: el aviso de
        // Vite (500 kB) se sube para que salte con lo que crezca de más.
        chunkSizeWarningLimit: 600,
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
