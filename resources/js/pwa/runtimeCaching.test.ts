// @vitest-environment node
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';

import type { RuntimeCaching } from './runtimeCaching';
import { OFFLINE_URL, runtimeCaching } from './runtimeCaching';

const messages = { es, en };
const APP = 'https://veniroldanillo.co';
const MAP = 'https://wokerjj.github.io/veni-mapa';
const ENV = {
    VITE_MAP_STYLE_URL: `${MAP}/style/veni-{theme}-{locale}.json`,
    VITE_MAP_ROUTES_URL: `${MAP}/roldanillo-rutas.json`,
};

interface Asked {
    url: string;
    method?: string;
    mode?: string;
}

/**
 * La función tal como queda en public/sw.js: generateSW la copia como texto,
 * así que allá no ve nada de este módulo. Si usara algo de fuera, aquí
 * fallaría igual que en el service worker.
 */
function inWorker(written: unknown, globals: Record<string, unknown> = {}): unknown {
    return runInNewContext(`(${String(written)})`, globals);
}

/** Como workbox-routing: por método, gana la primera ruta que acepta el pedido. */
function routeFor(routes: readonly RuntimeCaching[], { url, method = 'GET', mode = 'cors' }: Asked): RuntimeCaching | undefined {
    const parsed = new URL(url, APP);
    const sameOrigin = parsed.origin === APP;

    return routes.find((route) => {
        if ((route.method ?? 'GET') !== method) {
            return false;
        }

        if (route.urlPattern instanceof RegExp) {
            const found = route.urlPattern.exec(parsed.href);

            // De otro origen, Workbox solo acepta la coincidencia desde el principio.
            return found !== null && (sameOrigin || found.index === 0);
        }

        const accepts = inWorker(route.urlPattern) as (asked: { url: URL; sameOrigin: boolean; request: { method: string; mode: string } }) => unknown;

        return Boolean(accepts({ url: parsed, sameOrigin, request: { method, mode } }));
    });
}

/** Las rutas que guardan algo en el dispositivo: las que atiende una estrategia de Workbox con caché. */
function caching(routes: readonly RuntimeCaching[]): RuntimeCaching[] {
    return routes.filter((route) => typeof route.handler === 'string' && route.handler !== 'NetworkOnly');
}

/*
| La navegación no usa una estrategia de Workbox: la atiende una función
| propia, que aquí corre como en el service worker, con su red, su reloj y su
| Cache API de mentira. Esa Cache API solo sabe buscar: si la función
| intentara guardar la página, fallaría.
*/
describe('navegaciones', () => {
    const PAGE = { from: 'la red' };
    const PRELOADED = { from: 'el navegador, antes de arrancar el service worker' };
    const OFFLINE_PAGE = { from: 'el precache' };
    const NETWORK_ERROR = { from: 'Response.error()' };
    const never = new Promise<never>(() => undefined);

    function navigate(network: { fetch: () => Promise<unknown>; preloadResponse?: Promise<unknown>; offlinePage?: unknown }) {
        const route = routeFor(runtimeCaching(ENV), { url: '/restaurantes/1', mode: 'navigate' });
        const fetched = vi.fn(network.fetch);
        const match = vi.fn(() => Promise.resolve('offlinePage' in network ? network.offlinePage : OFFLINE_PAGE));
        const handler = inWorker(route?.handler, {
            fetch: fetched,
            caches: { match },
            Response: { error: () => NETWORK_ERROR },
            // El reloj de la prueba (vi.useFakeTimers), leído al llamarlo.
            setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
            clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
                clearTimeout(timer);
            },
        }) as (context: { event: { preloadResponse?: Promise<unknown> }; request: { url: string; mode: string } }) => Promise<unknown>;
        const result: { answer?: unknown } = {};

        void handler({
            event: network.preloadResponse === undefined ? {} : { preloadResponse: network.preloadResponse },
            request: { url: `${APP}/restaurantes/1`, mode: 'navigate' },
        }).then((answer) => {
            result.answer = answer;
        });

        return { result, fetched, match };
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('con red, responde lo que llegó y no busca nada guardado', async () => {
        const { result, fetched, match } = navigate({ fetch: () => Promise.resolve(PAGE) });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.answer).toBe(PAGE);
        expect(fetched).toHaveBeenCalledWith({ url: `${APP}/restaurantes/1`, mode: 'navigate' });
        expect(match).not.toHaveBeenCalled();
        // El plazo no queda corriendo detrás de una página ya servida.
        expect(vi.getTimerCount()).toBe(0);
    });

    it('usa la respuesta que el navegador ya pidió mientras arrancaba el service worker', async () => {
        const { result, fetched } = navigate({ fetch: () => Promise.resolve(PAGE), preloadResponse: Promise.resolve(PRELOADED) });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.answer).toBe(PRELOADED);
        expect(fetched).not.toHaveBeenCalled();
    });

    it('sin esa respuesta adelantada, va a la red', async () => {
        const { result } = navigate({ fetch: () => Promise.resolve(PAGE), preloadResponse: Promise.resolve(undefined) });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.answer).toBe(PAGE);
    });

    it('sin red, muestra la página sin conexión del precache', async () => {
        const { result, match } = navigate({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.answer).toBe(OFFLINE_PAGE);
        // El precache la guarda con su versión en la URL (?__WB_REVISION__=…).
        expect(match).toHaveBeenCalledWith(OFFLINE_URL, { ignoreSearch: true });
    });

    it('con la red colgada, espera 10 segundos y muestra la página sin conexión', async () => {
        const { result } = navigate({ fetch: () => never });

        await vi.advanceTimersByTimeAsync(9_999);
        expect(result.answer).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1);
        expect(result.answer).toBe(OFFLINE_PAGE);
    });

    it('el plazo también cuenta para la respuesta adelantada del navegador', async () => {
        const { result } = navigate({ fetch: () => Promise.resolve(PAGE), preloadResponse: never });

        await vi.advanceTimersByTimeAsync(10_000);

        expect(result.answer).toBe(OFFLINE_PAGE);
    });

    it('una red lenta que responde antes del plazo gana', async () => {
        const { result, match } = navigate({
            fetch: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 9_000, PAGE);
                }),
        });

        await vi.advanceTimersByTimeAsync(9_000);
        expect(result.answer).toBe(PAGE);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(match).not.toHaveBeenCalled();
    });

    it('sin página sin conexión guardada, falla como fallaría sin service worker', async () => {
        const { result } = navigate({ fetch: () => Promise.reject(new TypeError('Failed to fetch')), offlinePage: undefined });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.answer).toBe(NETWORK_ERROR);
    });

    it.each([
        ['es', 'Sin señal o muy lenta'],
        ['en', 'No signal, or it is too slow'],
    ] as const)('la página que sale no afirma que no hay conexión: también sale con la red lenta (%s)', (locale, title) => {
        expect(messages[locale]['offline.title']).toBe(title);
    });
});

describe('rutas del service worker', () => {
    const routes = runtimeCaching(ENV);

    it.each([
        ['el inicio', '/'],
        ['una página con parámetros', '/restaurantes/1?lang=en'],
        ['la página sin conexión', OFFLINE_URL],
        ['un archivo del build abierto en la barra de direcciones', '/build/assets/app-BVu2wVXg.js'],
        ['una fuente abierta en la barra de direcciones', '/fonts/figtree-latin.woff2'],
    ])('una navegación (%s) nunca cae en una ruta con caché', (_name, url) => {
        const route = routeFor(routes, { url, mode: 'navigate' });

        expect(route).toBeDefined();
        expect(caching(routes)).not.toContain(route);
        expect(route?.options?.cacheName).toBeUndefined();
    });

    it('el cambio de idioma (PUT /locale) no pasa por ninguna ruta', () => {
        expect(routeFor(routes, { url: '/locale', method: 'PUT', mode: 'same-origin' })).toBeUndefined();
        // Ninguna ruta atiende otra cosa que GET.
        expect(routes.map((route) => route.method ?? 'GET')).toEqual(routes.map(() => 'GET'));
    });

    it('toda ruta con caché tiene tope y solo guarda respuestas 200', () => {
        const cached = caching(routes);

        expect(cached.length).toBeGreaterThan(0);

        for (const route of cached) {
            const name = route.options?.cacheName ?? undefined;

            expect(name, 'cada ruta con caché nombra la suya').toEqual(expect.any(String));
            expect(route.options?.expiration?.maxEntries, name).toBeGreaterThan(0);
            expect(route.options?.expiration?.purgeOnQuotaError, name).toBe(true);
            expect(route.options?.cacheableResponse?.statuses, name).toEqual([200]);
        }
    });

    it('cada caché es de una sola ruta: dos topes sobre la misma se pisarían', () => {
        const names = caching(routes).map((route) => route.options?.cacheName);

        expect(new Set(names).size).toBe(names.length);
    });

    it.each([
        ['un chunk del build', '/build/assets/Home-C0ffee12.js', 'CacheFirst', 'veni-assets'],
        ['una fuente', '/fonts/figtree-latin.woff2', 'StaleWhileRevalidate', 'veni-fonts'],
        // MapLibre: dos archivos de más de 500 kB entre los dos, en su propia caché.
        ['el motor del mapa', '/build/assets/engine-DSZWC3fb.js', 'CacheFirst', 'veni-map-engine'],
        ['lo que el motor comparte con su worker', '/build/assets/maplibre-gl-shared-BuIWY37F.js', 'CacheFirst', 'veni-map-engine'],
        ['la hoja de estilos del motor', '/build/assets/engine-CwOYNOW1.css', 'CacheFirst', 'veni-assets'],
        ['el worker del mapa', '/build/assets/maplibre-gl-worker-CJUstZ_S.js', 'CacheFirst', 'veni-assets'],
        // Sin versión en la ruta, la misma URL cambia con cada release de veni-mapa.
        ['el estilo del mapa sin versión', `${MAP}/style/veni-claro-es.json`, 'NetworkFirst', 'veni-map-style'],
        ['la lista del sprite sin versión', `${MAP}/sprites/light.json`, 'NetworkFirst', 'veni-map-style'],
        ['los glyphs sin versión', `${MAP}/fonts/Figtree%20Regular/0-255.pbf`, 'StaleWhileRevalidate', 'veni-map'],
        ['la imagen del sprite sin versión', `${MAP}/sprites/light@2x.png`, 'StaleWhileRevalidate', 'veni-map'],
        // Con versión, nunca cambia.
        ['el estilo de una versión del mapa', `${MAP}/v0.2.0/style/veni-claro-es.json`, 'CacheFirst', 'veni-map-release'],
        ['los glyphs de una versión del mapa', `${MAP}/v0.2.0/fonts/Figtree%20Regular/0-255.pbf`, 'CacheFirst', 'veni-map-release'],
    ])('%s: %s en %s', (_name, url, handler, cacheName) => {
        const route = routeFor(routes, { url });

        expect(route?.handler).toBe(handler);
        expect(route?.options?.cacheName).toBe(cacheName);
    });

    it.each([
        ['el PMTiles', `${MAP}/roldanillo.pmtiles`],
        ['el PMTiles de una versión', `${MAP}/v0.2.0/roldanillo.pmtiles`],
        ['el grafo de rutas', ENV.VITE_MAP_ROUTES_URL],
        ['el manifest del build', '/build/manifest.json'],
    ])('%s no pasa por ninguna ruta', (_name, url) => {
        expect(routeFor(routes, { url })).toBeUndefined();
    });

    it('el motor del mapa guarda dos versiones de sus dos archivos, no más', () => {
        const engine = routeFor(routes, { url: '/build/assets/engine-DSZWC3fb.js' });

        expect(engine?.options?.expiration?.maxEntries).toBe(4);
    });

    it('con la red lenta, el estilo guardado sale a los pocos segundos', () => {
        const style = routeFor(routes, { url: `${MAP}/style/veni-claro-es.json` });

        expect(style?.options?.networkTimeoutSeconds).toBe(3);
    });

    it('sin URL del estilo no hay rutas para el mapa', () => {
        const withoutMap = runtimeCaching({});

        expect(routeFor(withoutMap, { url: `${MAP}/style/veni-claro-es.json` })).toBeUndefined();
        expect(routeFor(withoutMap, { url: `${MAP}/v0.2.0/style/veni-claro-es.json` })).toBeUndefined();
        expect(withoutMap.map((route) => route.options?.cacheName)).toEqual([undefined, 'veni-map-engine', 'veni-assets', 'veni-fonts']);
    });
});
