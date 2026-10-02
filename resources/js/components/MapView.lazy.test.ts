import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/*
| Carga perezosa de MapLibre (ADR 0007), vista desde el componente: importar
| MapView no trae el motor del mapa; montarlo, sí. Va en su propio archivo
| para que ningún import() que otra prueba dejó en camino cuente como de esta.
| Que el motor quede además en un chunk aparte lo comprueba, con una
| compilación de verdad, resources/js/map/bundle.test.ts.
*/

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const STYLE_URL = 'https://tiles.example.test/style/veni-claro-es.json';

let engineImports = 0;

/** El motor del mapa, de mentira: aquí solo importa cuándo se pide y si baja. */
function mockEngine({ fails = false } = {}): void {
    vi.doMock('@/map/engine', () => {
        engineImports += 1;

        if (fails) {
            // Lo que da import() cuando la señal se corta mientras baja el chunk.
            throw new TypeError('Failed to fetch dynamically imported module');
        }

        // Un mapa que nunca termina de cargar.
        return { createMap: () => new Promise(() => undefined) };
    });
}

/** El estilo queda pendiente: aquí solo importa cuándo se pide. */
function stubFetch() {
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    engineImports = 0;
    // Sin depender del .env de quien corre las pruebas.
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.test/style/veni-{theme}-{locale}.json');
    document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
    vi.doUnmock('@/map/engine');
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.theme;
});

it('no importa el motor del mapa hasta que el componente se monta', async () => {
    mockEngine();
    stubFetch();
    const { default: MapView } = await import('./MapView.vue');
    await flushPromises();

    expect(engineImports).toBe(0);

    const wrapper = mount(MapView);

    await vi.waitFor(() => {
        expect(engineImports).toBe(1);
    });
    expect(wrapper.get('section').attributes('aria-busy')).toBe('true');
});

it('pide el estilo a la vez que el motor, sin esperar a que baje', async () => {
    mockEngine();
    const fetchMock = stubFetch();
    const { default: MapView } = await import('./MapView.vue');

    mount(MapView);

    // Recién montado, sin ceder el turno: el import() del motor no pudo haber terminado.
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(STYLE_URL, { signal: expect.any(AbortSignal) as AbortSignal });
});

it('si no bajó el motor, reintentar recarga la página', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    mockEngine({ fails: true });
    stubFetch();
    const { default: MapView } = await import('./MapView.vue');
    const wrapper = mount(MapView);

    await vi.waitFor(() => {
        expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    });
    expect(engineImports).toBe(1);

    // Repetir el import() traería el código, pero no la hoja de estilos de
    // MapLibre que Vite carga con él: el mapa saldría sin estilos.
    await wrapper.get('[role="alert"] button').trigger('click');

    expect(reload).toHaveBeenCalledOnce();
    expect(engineImports).toBe(1);
});
