import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import laravel from 'laravel-vite-plugin';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { missingStylePlaceholders } from './resources/js/map/styleTemplate';

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

/**
 * `VITE_MAP_STYLE_URL` es una plantilla con `{theme}` y `{locale}` (ADR 0007).
 * Con una URL fija, como la de un `.env` anterior a los marcadores, el mapa se
 * queda en un solo tema y un solo idioma y nada falla. Vite escribe la
 * variable en el JavaScript al compilar: después ya no hay dónde corregirla.
 *
 * - Definida y sin algún marcador: `vite build` se detiene. Nunca es una
 *   configuración válida, y un aviso entre la salida de una compilación (la de
 *   la imagen de Docker, por ejemplo) pasa de largo.
 * - En `vite` (desarrollo) avisa en la terminal y sigue: el mapa se ve, y el
 *   navegador repite el aviso en la consola (resources/js/map/styleUrl.ts).
 * - Sin definir: avisa y compila. Así compila CI, que no tiene `.env`; la app
 *   muestra el mapa como no disponible.
 */
function checkMapStyleUrl(): Plugin {
    return {
        name: 'veni:check-map-style-url',
        configResolved(config) {
            const value: unknown = config.env.VITE_MAP_STYLE_URL;
            const template = typeof value === 'string' ? value.trim() : '';

            if (template === '') {
                config.logger.warn('VITE_MAP_STYLE_URL no está definida: el mapa no va a cargar. Copiala de .env.example.');

                return;
            }

            const missing = missingStylePlaceholders(template);

            if (missing.length === 0) {
                return;
            }

            const message =
                `VITE_MAP_STYLE_URL no trae ${missing.join(' ni ')}: el mapa no seguiría al tema ni al idioma. ` +
                `Es una plantilla, …/veni-{theme}-{locale}.json (ver .env.example). Valor actual: ${template}`;

            if (config.command === 'build') {
                throw new Error(message);
            }

            config.logger.warn(message);
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
        checkMapStyleUrl(),
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
        // La CSP de desarrollo (app/Support/ContentSecurityPolicy.php) deja
        // pasar al servidor de Vite por el origen que el plugin de Laravel
        // escribe en public/hot. Sin host, en Windows sale la IPv6 literal
        // (http://[::1]:5173), que una CSP no puede nombrar y la página quedaba
        // sin scripts; con 'localhost' sale http://localhost:5173. Vite sigue
        // escuchando solo en este equipo.
        host: 'localhost',
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
