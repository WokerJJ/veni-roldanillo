import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAIN_STREET } from '@/testing/routes';

const URL_ROUTES = 'https://tiles.example.test/roldanillo-rutas.json';

function stubGraphFetch() {
    let failing = false;
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
        Promise.resolve(failing ? { ok: false, status: 503, json: () => Promise.reject(new Error('sin cuerpo')) } : { ok: true, status: 200, json: () => Promise.resolve(MAIN_STREET) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    return {
        fetchMock,
        fail: (value: boolean) => {
            failing = value;
        },
    };
}

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('loadRouter', () => {
    it('descarga el grafo una sola vez, aunque se pidan varias rutas', async () => {
        const network = stubGraphFetch();
        const { loadRouter } = await import('./loadRouter');

        const [first, second] = await Promise.all([loadRouter(URL_ROUTES), loadRouter(URL_ROUTES)]);
        const third = await loadRouter(URL_ROUTES);

        expect(first).toBe(second);
        expect(third).toBe(first);
        expect(network.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('el pedido es solo la URL del grafo: no lleva nada de quien lo pide', async () => {
        const network = stubGraphFetch();
        const { loadRouter } = await import('./loadRouter');

        await loadRouter(URL_ROUTES);

        expect(network.fetchMock.mock.calls).toEqual([[URL_ROUTES]]);
    });

    it('usa VITE_MAP_ROUTES_URL', async () => {
        vi.stubEnv('VITE_MAP_ROUTES_URL', URL_ROUTES);
        const network = stubGraphFetch();
        const { loadRouter } = await import('./loadRouter');

        await loadRouter();

        expect(network.fetchMock).toHaveBeenCalledWith(URL_ROUTES);
    });

    it('calcula rutas a pie y en carro sobre el grafo', async () => {
        stubGraphFetch();
        const { loadRouter } = await import('./loadRouter');
        const router = await loadRouter(URL_ROUTES);

        const foot = router.route([-76.1598, 4.4129], [-76.1502, 4.4127], 'foot');
        const car = router.route([-76.1598, 4.4129], [-76.1502, 4.4127], 'car');

        expect(foot?.distance).toBeGreaterThan(1000);
        expect(car?.distance).toBe(foot?.distance);
        // A pie a 4,5 km/h y en carro a 25 km/h por una calle residencial.
        expect(foot?.duration).toBeGreaterThan(car?.duration ?? Infinity);
    });

    it('si la descarga falla, la olvida: la próxima ruta la vuelve a pedir', async () => {
        const network = stubGraphFetch();
        const { loadRouter } = await import('./loadRouter');
        network.fail(true);
        const { RoutesOfflineError } = await import('./loadRouter');

        const failed = loadRouter(URL_ROUTES);
        await expect(failed).rejects.toThrow('HTTP 503');
        await expect(failed).rejects.toBeInstanceOf(RoutesOfflineError);

        network.fail(false);
        await expect(loadRouter(URL_ROUTES)).resolves.toBeDefined();
        expect(network.fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sin la red (fetch rechaza), también se puede reintentar', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(MAIN_STREET) });
        vi.stubGlobal('fetch', fetchMock);
        const { loadRouter } = await import('./loadRouter');

        const { RoutesOfflineError } = await import('./loadRouter');

        await expect(loadRouter(URL_ROUTES)).rejects.toBeInstanceOf(RoutesOfflineError);
        await expect(loadRouter(URL_ROUTES)).resolves.toBeDefined();
    });

    it('un grafo de otro formato no se usa: el router lo rechaza', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ...MAIN_STREET, version: 2 }) }));
        const { loadRouter } = await import('./loadRouter');

        const { RoutesOfflineError } = await import('./loadRouter');

        const rejected = loadRouter(URL_ROUTES);
        await expect(rejected).rejects.toThrow('formato no soportado');
        await expect(rejected).rejects.not.toBeInstanceOf(RoutesOfflineError);
    });

    it('sin URL del grafo no sale a la red', async () => {
        const network = stubGraphFetch();
        const { loadRouter, RoutesUnavailableError } = await import('./loadRouter');

        await expect(loadRouter('')).rejects.toBeInstanceOf(RoutesUnavailableError);
        expect(network.fetchMock).not.toHaveBeenCalled();
    });
});
