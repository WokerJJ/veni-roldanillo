import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';

/*
| Carga perezosa de MapLibre (ADR 0007), vista desde el componente: importar
| MapView no trae el motor del mapa; montarlo, sí. Va en su propio archivo
| para que ningún import() que otra prueba dejó en camino cuente como de esta.
| Que el motor quede además en un chunk aparte lo comprueba, con una
| compilación de verdad, resources/js/map/bundle.test.ts.
*/

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

let engineImports = 0;

vi.mock('@/map/engine', () => {
    engineImports += 1;

    // Un mapa que nunca termina de cargar: aquí solo importa cuándo se pide el motor.
    return { createMap: () => new Promise(() => undefined) };
});

enableAutoUnmount(afterEach);

it('no importa el motor del mapa hasta que el componente se monta', async () => {
    const { default: MapView } = await import('./MapView.vue');
    await flushPromises();

    expect(engineImports).toBe(0);

    const wrapper = mount(MapView);

    await vi.waitFor(() => {
        expect(engineImports).toBe(1);
    });
    expect(wrapper.get('section').attributes('aria-busy')).toBe('true');
});
