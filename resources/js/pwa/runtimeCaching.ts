import type { VitePWAOptions } from 'vite-plugin-pwa';

import { mapCachePattern } from './mapCache';

/*
| Qué hace el service worker con cada pedido que no está en el precache (#5).
| vite.config.ts le pasa esta lista a generateSW, que la escribe en
| public/sw.js. Las funciones se copian ahí como texto: no pueden usar nada
| que esté fuera de ellas, ni siquiera una constante de este módulo (lo vigila
| runtimeCaching.test.ts, que las vuelve a armar aparte antes de llamarlas).
| El porqué de cada estrategia, en docs/03-arquitectura.md («App instalable y
| caché»).
*/

export type RuntimeCaching = NonNullable<NonNullable<VitePWAOptions['workbox']>['runtimeCaching']>[number];

/** Página sin conexión (resources/views/offline.blade.php, la sirve Laravel); va en el precache. */
export const OFFLINE_URL = '/offline';

const DAY = 60 * 60 * 24;

/** Lo que workbox-routing le pasa a quien atiende una navegación. */
interface Navigation {
    /** El FetchEvent; con `navigationPreload`, trae la respuesta que el navegador ya pidió. */
    event: object;
    request: Request;
}

/** La Cache API del service worker, donde corre `navigation`; aquí solo se declara. */
declare const caches: { match(url: string, options: { ignoreSearch: boolean }): Promise<Response | undefined> };

/**
 * Navegaciones: siempre a la red y sin guardar nada (el HTML depende del
 * idioma y de la sesión). Si la red falla o no responde en 10 segundos, la
 * página sin conexión del precache: con mala señal, esperar más es mirar una
 * pantalla en blanco.
 *
 * Es una función propia y no `NetworkOnly` con `networkTimeoutSeconds` porque
 * generateSW (workbox-build 7) solo acepta ese plazo con `NetworkFirst`, que
 * guarda lo que responde. Se copia como texto en public/sw.js: por eso
 * repite OFFLINE_URL y el plazo en vez de usar las constantes del módulo.
 */
export async function navigation({ event, request }: Navigation): Promise<Response> {
    // El precache la guarda con su versión en la URL (?__WB_REVISION__=…).
    const offline = async (): Promise<Response> => (await caches.match('/offline', { ignoreSearch: true })) ?? Response.error();
    let stopWaiting = (): void => undefined;
    const late = new Promise<undefined>((resolve) => {
        const timer = setTimeout(() => {
            resolve(undefined);
        }, 10000);

        stopWaiting = () => {
            clearTimeout(timer);
        };
    });

    try {
        const preloaded = (event as { preloadResponse?: Promise<Response | undefined> }).preloadResponse;
        const answer = Promise.resolve(preloaded).then((response) => response ?? fetch(request));

        return (await Promise.race([answer, late])) ?? (await offline());
    } catch {
        return await offline();
    } finally {
        stopWaiting();
    }
}

/**
 * Las rutas del service worker, en el orden en que Workbox las prueba: gana
 * la primera que acepta el pedido. `env` son las variables `VITE_` de la
 * compilación; sin URL del estilo del mapa no hay ruta para el mapa.
 *
 * Lo que no tiene ruta sale a la red como si no hubiera service worker. Así
 * va, a propósito, todo `/api/`: los restaurantes del mapa
 * (`/api/restaurants.geojson`) solo los guarda la caché HTTP del navegador,
 * un minuto y con ETag (ADR 0017). Una copia aquí podría volver a mostrar una
 * ficha que ya se ocultó, y sin red la app tampoco abre: el HTML no se guarda.
 */
export function runtimeCaching(env: Readonly<Record<string, string | undefined>>): RuntimeCaching[] {
    return [
        {
            // Va primera: ninguna ruta con caché llega a ver una navegación.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: navigation,
        },
        {
            // MapLibre: el motor y lo que comparte con su worker, más de
            // 500 kB entre los dos. En su propia caché, con lugar para dos
            // versiones: en la de los demás chunks, cada compilación dejaría
            // otro par guardado hasta vencer, y los íconos podrían sacarlos.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/build\/assets\/(?:engine|maplibre-gl-shared)-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
                cacheName: 'veni-map-engine',
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] },
            },
        },
        {
            // Chunks con hash que no van en el shell: cada ícono, las otras
            // páginas, lo demás del mapa. Nunca cambian.
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
        ...mapRoutes(env.VITE_MAP_STYLE_URL, env.VITE_MAP_ROUTES_URL),
    ];
}

/**
 * Estilos, glyphs y sprites del host del mapa (mapCache.ts). Qué se hace con
 * cada archivo depende de si su URL puede traer otra cosa mañana:
 *
 * - Con la versión en la ruta (`/v0.2.0/`) no cambia nunca: el guardado vale.
 * - Sin versión, el estilo y la lista del sprite (`.json`) dicen qué pedir y
 *   dónde está cada ícono: primero la red, para no pintar un release nuevo
 *   con el estilo del anterior; el guardado sale sin red o si tarda.
 * - Sin versión, glyphs e imágenes: el guardado ya, y se renueva detrás.
 */
function mapRoutes(styleUrl: string | undefined, routesUrl: string | undefined): RuntimeCaching[] {
    const released = mapCachePattern(styleUrl, routesUrl, { versioned: true });
    const lists = mapCachePattern(styleUrl, routesUrl, { versioned: false, files: ['json'] });
    const rest = mapCachePattern(styleUrl, routesUrl, { versioned: false, files: ['pbf', 'png', 'webp'] });

    if (released === null || lists === null || rest === null) {
        return [];
    }

    return [
        {
            urlPattern: released,
            handler: 'CacheFirst',
            options: {
                cacheName: 'veni-map-release',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] },
            },
        },
        {
            urlPattern: lists,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'veni-map-style',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 12, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] },
            },
        },
        {
            urlPattern: rest,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'veni-map',
                expiration: { maxEntries: 60, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] },
            },
        },
    ];
}
