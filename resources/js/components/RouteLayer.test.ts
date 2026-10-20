import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';

import type { RouteProfile, RouteState } from '@/routing/directions';
import { stubGeolocation } from '@/testing/geolocation';
import type * as FakeInertia from '@/testing/inertia';
import type * as FakeMapLibre from '@/testing/maplibre';
import { MAIN_STREET } from '@/testing/routes';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
vi.mock('maplibre-gl', () => import('@/testing/maplibre'));
vi.mock('pmtiles', () => ({
    Protocol: class {
        tile = vi.fn();
    },
}));

/*
| La ruta de «Cómo llegar» (#11) con el motor de verdad, MapLibre de mentira
| (resources/js/testing/maplibre.ts), la ubicación de mentira y el grafo de
| una calle recta (resources/js/testing/routes.ts).
*/

const TEMPLATE = 'https://tiles.example.test/style/veni-{theme}-{locale}.json';
const ROUTES = 'https://tiles.example.test/roldanillo-rutas.json';
const BOUNDS = [-76.3, 4.3, -76, 4.55];
/** Al final de la calle del grafo. */
const RESTAURANT: [number, number] = [-76.1502, 4.4127];
/** Al principio de la calle, con cifras que no aparecen en ningún otro lado. */
const SECRET = { longitude: -76.1598137, latitude: 4.4129371 };
const SECRET_TRACE = /76\.15981|4\.41293|4,41293|76,15981/;

function style(url: string) {
    return {
        version: 8,
        name: url,
        center: [-76.1547, 4.4128],
        zoom: 13.5,
        metadata: { 'veni:bounds': BOUNDS },
        sources: {},
        layers: [
            { id: 'roads', type: 'line' },
            { id: 'roads-labels', type: 'symbol' },
        ],
    };
}

/** fetch de mentira: el estilo y el grafo. Con `offline`, el grafo no baja; `graph` es el que baja. */
function stubNetwork() {
    const network: { offline: boolean; graph: unknown } = { offline: false, graph: MAIN_STREET };
    const fetchMock = vi.fn((url: string) => {
        if (url === ROUTES) {
            return network.offline ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(network.graph) });
        }

        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(style(url)) });
    });
    vi.stubGlobal('fetch', fetchMock);

    return Object.assign(network, { fetchMock });
}

async function mountRoute(destination: [number, number] = RESTAURANT) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    const maplibre = (await import('maplibre-gl')) as unknown as typeof FakeMapLibre;
    inertia.reset();
    maplibre.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: MapView } = await import('./MapView.vue');
    const { default: RouteLayer } = await import('./RouteLayer.vue');
    const states: RouteState[] = [];
    const props = reactive<{ profile: RouteProfile; attempt: number }>({ profile: 'foot', attempt: 0 });
    const wrapper = mount(
        defineComponent({
            render: () =>
                h(MapView, null, {
                    default: () => [
                        h(RouteLayer, {
                            destination,
                            profile: props.profile,
                            attempt: props.attempt,
                            onState: (state: RouteState) => states.push(state),
                        }),
                    ],
                }),
        }),
    );

    await vi.waitFor(
        () => {
            expect(maplibre.maps.length).toBeGreaterThan(0);
        },
        { timeout: 10_000 },
    );
    const map = maplibre.maps[0] as FakeMapLibre.Map;
    map.fire('load');
    await flushPromises();

    return {
        wrapper,
        inertia,
        map,
        props,
        states,
        last: () => states.at(-1),
        button: () => map.container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate'),
        lineData: () => map.getStyle().sources?.route?.data as GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection,
        layerIds: () => (map.getStyle().layers ?? []).map((layer) => layer.id),
    };
}

/** Lo que el router tarda: baja el grafo (promesas) y calcula. */
async function settle(): Promise<void> {
    await vi.waitFor(async () => {
        await flushPromises();
        expect(true).toBe(true);
    });
    await flushPromises();
}

enableAutoUnmount(afterEach);

beforeAll(async () => {
    await import('@/map/engine');
    await import('./RouteLayer.vue');
}, 60_000);

let network: ReturnType<typeof stubNetwork>;

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    vi.stubEnv('VITE_MAP_STYLE_URL', TEMPLATE);
    vi.stubEnv('VITE_MAP_ROUTES_URL', ROUTES);
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    network = stubNetwork();
});

afterEach(async () => {
    await vi.dynamicImportSettled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('RouteLayer', () => {
    it('enciende «¿Dónde estoy?» y, mientras no hay ubicación, no baja el grafo', async () => {
        const device = stubGeolocation();
        const { button, states } = await mountRoute();
        await flushPromises();

        expect(button()?.getAttribute('aria-pressed')).toBe('true');
        expect(device.geolocation.watchPosition).toHaveBeenCalledTimes(1);
        expect(states).toEqual([]);
        expect(network.fetchMock.mock.calls.map(([url]) => url)).not.toContain(ROUTES);
    });

    it('con la ubicación, calcula a pie y en carro, dibuja la de a pie debajo de las etiquetas y la encuadra', async () => {
        const device = stubGeolocation();
        const { map, last, states, lineData, layerIds } = await mountRoute();
        await flushPromises();

        device.move(SECRET);
        await settle();

        expect(states[0]).toEqual({ status: 'calculating' });
        const ready = last();
        expect(ready?.status).toBe('ready');

        if (ready?.status !== 'ready') {
            return;
        }

        expect(ready.routes.foot?.distance).toBeGreaterThan(900);
        expect(ready.routes.car?.distance).toBe(ready.routes.foot?.distance);
        expect(ready.routes.foot?.duration).toBeGreaterThan(ready.routes.car?.duration ?? Infinity);
        expect((lineData() as GeoJSON.Feature<GeoJSON.LineString>).geometry.coordinates.length).toBeGreaterThan(5);
        expect(layerIds()).toEqual(['roads', 'route-casing', 'route-line', 'route-snap', 'roads-labels']);
        expect(map.fitBounds).toHaveBeenLastCalledWith(
            [expect.closeTo(-76.16, 3), expect.closeTo(4.4127, 3), expect.closeTo(-76.1502, 3), expect.closeTo(4.4129, 3)],
            expect.objectContaining({ maxZoom: 17 }),
        );
        expect(network.fetchMock.mock.calls.filter(([url]) => url === ROUTES)).toHaveLength(1);
    });

    it('mientras quien la sigue camina, la recalcula sin volver a mover la cámara', async () => {
        const device = stubGeolocation();
        const { map, states } = await mountRoute();
        await flushPromises();
        device.move(SECRET);
        await settle();
        const framings = map.fitBounds.mock.calls.length;
        const before = states.length;

        // Unos 110 m más adelante por la calle.
        device.move({ longitude: -76.1587, latitude: 4.4128 });
        await settle();

        expect(states.length).toBeGreaterThan(before);
        expect(states.at(-1)?.status).toBe('ready');
        // El de «¿Dónde estoy?» sigue a la ubicación; la ruta no encuadra otra vez.
        expect(map.fitBounds.mock.calls.slice(framings).filter(([, options]) => (options as { maxZoom?: number }).maxZoom === 17)).toEqual([]);
    });

    it('al cambiar a en carro, dibuja esa y la encuadra', async () => {
        const device = stubGeolocation();
        const { map, props } = await mountRoute();
        await flushPromises();
        device.move(SECRET);
        await settle();
        const framings = map.fitBounds.mock.calls.length;

        props.profile = 'car';
        await flushPromises();

        expect(map.fitBounds.mock.calls.length).toBe(framings + 1);
    });

    it('sin señal, el grafo no baja: lo dice, y al reintentar lo vuelve a pedir', async () => {
        const device = stubGeolocation();
        network.offline = true;
        const { last, props } = await mountRoute();
        await flushPromises();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => {
            errors.mockRestore();
        });

        device.move(SECRET);
        await settle();
        expect(last()).toEqual({ status: 'offline' });

        network.offline = false;
        props.attempt += 1;
        await settle();

        expect(last()?.status).toBe('ready');
    });

    it('un grafo de otro formato no es falta de señal: lo dice sin ofrecer reintentar', async () => {
        const device = stubGeolocation();
        network.graph = { ...MAIN_STREET, version: 2 };
        const { last } = await mountRoute();
        await flushPromises();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => {
            errors.mockRestore();
        });

        device.move(SECRET);
        await settle();

        expect(last()).toEqual({ status: 'error' });
    });

    it('sin la URL del grafo, tampoco es falta de señal', async () => {
        const device = stubGeolocation();
        vi.stubEnv('VITE_MAP_ROUTES_URL', '');
        const { last } = await mountRoute();
        await flushPromises();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => {
            errors.mockRestore();
        });

        device.move(SECRET);
        await settle();

        expect(last()).toEqual({ status: 'error' });
        expect(network.fetchMock.mock.calls.map(([url]) => url)).not.toContain(ROUTES);
    });

    it('con el restaurante lejos de las calles, lo dice y no recalcula con cada lectura', async () => {
        const device = stubGeolocation();
        const { last, states } = await mountRoute([-76.25, 4.35]);
        await flushPromises();

        device.move(SECRET);
        await settle();
        expect(last()).toEqual({ status: 'destination-far' });
        const reported = states.length;

        device.move({ longitude: -76.155, latitude: 4.4129 });
        await settle();

        expect(states).toHaveLength(reported);
    });

    it('sin ruta desde donde está, no recalcula mientras no se mueva 25 m', async () => {
        const device = stubGeolocation();
        const { last, states } = await mountRoute();
        await flushPromises();

        device.move({ longitude: -76.25, latitude: 4.35 });
        await settle();
        expect(last()).toEqual({ status: 'far' });
        const reported = states.length;

        device.move({ longitude: -76.25005, latitude: 4.35005 });
        await settle();

        expect(states).toHaveLength(reported);
    });

    it('lejos de las calles del mapa, dentro de la región, lo dice', async () => {
        const device = stubGeolocation();
        const { last } = await mountRoute();
        await flushPromises();

        device.move({ longitude: -76.25, latitude: 4.35 });
        await settle();

        expect(last()).toEqual({ status: 'far' });
    });

    it('fuera de la región del mapa, lo dice y no calcula', async () => {
        const device = stubGeolocation();
        const { last } = await mountRoute();
        await flushPromises();

        device.move({ longitude: -74.0721, latitude: 4.711 });
        await settle();

        expect(last()).toEqual({ status: 'outside' });
        expect(network.fetchMock.mock.calls.map(([url]) => url)).not.toContain(ROUTES);
    });

    it('con el permiso negado, lo dice', async () => {
        const device = stubGeolocation();
        const { last } = await mountRoute();
        await flushPromises();

        device.fail(1);
        await settle();

        expect(last()).toEqual({ status: 'denied' });
    });

    it('si apagan «¿Dónde estoy?», borra la ruta y lo dice', async () => {
        const device = stubGeolocation();
        const { last, button, lineData } = await mountRoute();
        await flushPromises();
        device.move(SECRET);
        await settle();

        // El primero vuelve a centrar; el segundo, apaga.
        button()?.click();
        button()?.click();
        await settle();

        expect(last()).toEqual({ status: 'off' });
        expect(lineData()).toEqual({ type: 'FeatureCollection', features: [] });
    });

    /*
    | Regla 3 de producto y ADR 0008: la posición se usa en el dispositivo y
    | no sale de él, tampoco con la ruta.
    */
    it('la posición no sale del dispositivo: ni a la red, ni a la dirección, ni al almacenamiento, ni a la página', async () => {
        const device = stubGeolocation();
        const pushState = vi.spyOn(window.history, 'pushState');
        const replaceState = vi.spyOn(window.history, 'replaceState');
        const beacon = vi.spyOn(navigator, 'sendBeacon');
        const { inertia, states, lineData } = await mountRoute();
        const href = window.location.href;
        await flushPromises();

        device.move(SECRET);
        await settle();

        // La ruta sí salió de ahí: la prueba no mira una ruta vacía.
        expect(JSON.stringify(lineData())).toMatch(/-76\.159/);
        expect(states.at(-1)?.status).toBe('ready');

        const leaks = (value: unknown): boolean => SECRET_TRACE.test(typeof value === 'string' ? value : JSON.stringify(value));
        const stored = [window.localStorage, window.sessionStorage].flatMap((storage) =>
            Array.from({ length: storage.length }, (_, index) => `${storage.key(index) ?? ''}=${storage.getItem(storage.key(index) ?? '') ?? ''}`),
        );

        expect(network.fetchMock.mock.calls.filter((call) => leaks(call))).toEqual([]);
        expect(network.fetchMock.mock.calls.filter(([url]) => url === ROUTES)).toEqual([[ROUTES]]);
        expect(beacon).not.toHaveBeenCalled();
        expect(leaks(states)).toBe(false);
        expect(leaks(Object.values(inertia.router).map((method) => (vi.isMockFunction(method) ? method.mock.calls : [])))).toBe(false);
        expect(window.location.href).toBe(href);
        expect(pushState).not.toHaveBeenCalled();
        expect(replaceState).not.toHaveBeenCalled();
        expect(leaks(stored)).toBe(false);
        expect(leaks(document.cookie)).toBe(false);
    });
});
