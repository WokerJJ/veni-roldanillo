import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import laravel from 'laravel-vite-plugin';
import type { Plugin, PluginOption } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { missingStylePlaceholders } from './resources/js/map/styleTemplate';
import { mapCachePattern } from './resources/js/pwa/mapCache';
import type { ViteManifest } from './resources/js/pwa/shellPrecache';
import { keepShell, staticFiles } from './resources/js/pwa/shellPrecache';

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

/**
 * Íconos de la app instalable (#5), tal como los exporta la marca en
 * brand/png: los del manifest (App\Support\WebApp::ICONS) y el de iOS
 * (WebApp::APPLE_TOUCH_ICON). Se copian al compilar, con el mismo nombre, a
 * public/build/icons: así no hay una segunda copia en git que se desactualice.
 * Sin hash en el nombre, como espera quien ya instaló la app.
 */
const BRAND_ICONS = ['veni-icono-192.png', 'veni-icono-512.png', 'veni-icono-maskable-512.png', 'favicon-180.png'];

function copyBrandIcons(): Plugin {
    return {
        name: 'veni:copy-brand-icons',
        apply: 'build',
        generateBundle() {
            for (const icon of BRAND_ICONS) {
                this.emitFile({
                    type: 'asset',
                    fileName: `icons/${icon}`,
                    source: readFileSync(fileURLToPath(new URL(`./brand/png/${icon}`, import.meta.url))),
                });
            }
        },
    };
}

/** Carpeta del proyecto: de aquí salen public/build y el .env. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * El shell que el service worker guarda al instalarse: la entrada y la página
 * de inicio con sus imports estáticos, CSS y logos (lo que vigila el
 * presupuesto del arranque en resources/js/map/bundle.test.ts). El mapa, los
 * íconos y las demás páginas se guardan la primera vez que se piden.
 */
const SHELL_ENTRIES = ['resources/js/app.ts', 'resources/js/pages/Home.vue'];

const DAY = 60 * 60 * 24;

/**
 * Service worker de la app instalable (#5), con generateSW: Workbox lo arma
 * con esta configuración y queda en public/sw.js, en la raíz, para que su
 * alcance sea todo el sitio sin cabeceras de más (lo sirve Caddy,
 * config/octane.php). Las estrategias y por qué, en docs/03-arquitectura.md
 * («App instalable y caché»).
 *
 * Bajo Vitest no genera nada: resources/js/map/bundle.test.ts compila en
 * memoria y el service worker saldría de un public/build viejo.
 */
function serviceWorker(env: Record<string, string>): PluginOption {
    const mapPattern = mapCachePattern(env.VITE_MAP_STYLE_URL, env.VITE_MAP_ROUTES_URL);

    return VitePWA({
        disable: process.env.VITEST !== undefined,
        strategies: 'generateSW',
        // Lo registra el bundle (resources/js/pwa/serviceWorker.ts), sin script
        // en línea: la CSP solo deja correr scripts de este origen o con nonce.
        injectRegister: false,
        // Avisa «Hay una versión nueva» en vez de recargar sin preguntar.
        registerType: 'prompt',
        // El manifest web lo sirve Laravel (WebManifestController).
        manifest: false,
        outDir: 'public',
        filename: 'sw.js',
        base: '/',
        buildBase: '/',
        scope: '/',
        workbox: {
            cacheId: 'veni',
            globDirectory: `${ROOT}public/build`,
            globPatterns: ['assets/*.{js,css,svg}'],
            modifyURLPrefix: { 'assets/': '/build/assets/' },
            // Con el hash en el nombre, la URL ya es la versión: se piden tal
            // cual y, si la página acaba de bajarlas, salen de la caché del
            // navegador sin volver a la red.
            dontCacheBustURLsMatching: /^\/build\/assets\//,
            manifestTransforms: [
                (entries) => {
                    const manifest = JSON.parse(readFileSync(`${ROOT}public/build/manifest.json`, 'utf8')) as ViteManifest;
                    const shell = staticFiles(manifest, SHELL_ENTRIES).map((file) => `/build/${file}`);

                    return { manifest: keepShell(entries, shell), warnings: [] };
                },
            ],
            // Sin respaldo de una página guardada: el HTML depende del idioma y de la sesión.
            navigateFallback: null,
            // Un solo archivo, sin el runtime de Workbox aparte.
            inlineWorkboxRuntime: true,
            cleanupOutdatedCaches: true,
            // La primera vez toma la página ya abierta y guarda lo que ella pide después.
            clientsClaim: true,
            runtimeCaching: [
                {
                    // Chunks con hash que no van en el shell: el mapa, cada
                    // ícono, las otras páginas. Nunca cambian.
                    urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/build/assets/'),
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'veni-assets',
                        expiration: { maxEntries: 120, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true },
                        cacheableResponse: { statuses: [200] },
                    },
                },
                {
                    // Sin hash en el nombre: se usa la guardada y se revalida detrás.
                    urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/fonts/') && url.pathname.endsWith('.woff2'),
                    handler: 'StaleWhileRevalidate',
                    options: {
                        cacheName: 'veni-fonts',
                        expiration: { maxEntries: 8, purgeOnQuotaError: true },
                        cacheableResponse: { statuses: [200] },
                    },
                },
                ...(mapPattern === null
                    ? []
                    : [
                          {
                              urlPattern: mapPattern,
                              handler: 'StaleWhileRevalidate' as const,
                              options: {
                                  cacheName: 'veni-map',
                                  expiration: { maxEntries: 60, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
                                  cacheableResponse: { statuses: [200] },
                              },
                          },
                      ]),
            ],
        },
    });
}

export default defineConfig(({ mode }) => ({
    plugins: [
        laravel({
            input: ['resources/js/app.ts'],
            refresh: true,
        }),
        vue(),
        tailwindcss(),
        shareMapWorkerCode(),
        checkMapStyleUrl(),
        copyBrandIcons(),
        serviceWorker(loadEnv(mode, ROOT, 'VITE_')),
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
}));
