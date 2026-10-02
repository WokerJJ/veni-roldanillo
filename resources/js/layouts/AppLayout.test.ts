import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountLayout(props: { immersive?: boolean } = {}) {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();

    const { default: AppLayout } = await import('./AppLayout.vue');

    return mount(AppLayout, { props, slots: { default: '<p>Página</p>' } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

describe('AppLayout', () => {
    it('por defecto crece con el contenido y termina en el pie de página', async () => {
        const wrapper = await mountLayout();

        expect(wrapper.classes()).toContain('min-h-dvh');
        expect(wrapper.classes()).not.toContain('h-dvh');
        expect(wrapper.get('main').text()).toBe('Página');
        expect(wrapper.get('footer').text()).toContain('Vení Roldanillo');
    });

    it('en modo inmersivo ocupa justo el alto de la pantalla, sin pie de página', async () => {
        const wrapper = await mountLayout({ immersive: true });

        expect(wrapper.classes()).toContain('h-dvh');
        expect(wrapper.classes()).not.toContain('min-h-dvh');
        expect(wrapper.find('footer').exists()).toBe(false);
        // La página se posiciona contra <main>, que no crece más que el espacio que queda.
        expect(wrapper.get('main').classes()).toEqual(expect.arrayContaining(['relative', 'min-h-0', 'flex-1']));
    });

    it.each([false, true])('con immersive=%s conserva la cabecera y el destino de «Saltar al contenido»', async (immersive) => {
        const wrapper = await mountLayout({ immersive });

        expect(wrapper.get('a[href="#contenido"]').text()).toBe('Saltar al contenido');
        expect(wrapper.get('main').attributes('id')).toBe('contenido');
        expect(wrapper.get('header').findAll('button').length).toBeGreaterThan(0);
    });
});
