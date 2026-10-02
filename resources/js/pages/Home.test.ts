import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
// El mapa tiene sus propias pruebas (components/MapView.test.ts): aquí queda cargando.
vi.mock('@/map/engine', () => ({ createMap: () => new Promise(() => undefined) }));

async function mountHome(locale: 'es' | 'en' = 'es') {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    fake.receiveFromServer(locale, { replace: true });

    const { default: Home } = await import('./Home.vue');

    return { Home, wrapper: mount(Home) };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.test/veni-{theme}-{locale}.json');
    // MapView pide el estilo al montarse, sin esperar al motor: aquí no sale a la red.
    vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise(() => undefined)),
    );
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Home', () => {
    it('le pide al layout el modo inmersivo: el mapa ocupa todo bajo la cabecera', async () => {
        const { Home, wrapper } = await mountHome();

        expect((Home as { layout?: unknown }).layout).toEqual({ immersive: true });
        expect(wrapper.get('inertia-head + div').classes()).toEqual(expect.arrayContaining(['absolute', 'inset-0']));
    });

    it('muestra el mapa de Roldanillo', async () => {
        const { wrapper } = await mountHome();

        expect(wrapper.get('section[aria-busy]').attributes('aria-label')).toBe('Mapa de Roldanillo');
    });

    it.each([
        ['es', 'Inicio', 'Vení, comamos en Roldanillo', 'Muy pronto'],
        ['en', 'Home', 'Come eat in Roldanillo', 'Coming soon'],
    ] as const)('en %s pone el título y una sola bienvenida sobre el mapa', async (locale, title, heading, soon) => {
        const { wrapper } = await mountHome(locale);

        expect(wrapper.get('inertia-head').attributes('title')).toBe(title);
        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.get('h1').text()).toBe(heading);
        expect(wrapper.text()).toContain(soon);
    });
});
