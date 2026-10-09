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

    // El layout es persistente: al navegar no se vuelve a montar y el foco
    // quedaría en <body>, sin que nada anuncie la página nueva.
    describe('al navegar', () => {
        /** El layout en el documento (el foco solo se mueve ahí), abierto en esa dirección. */
        async function mountLayoutAt(url: string) {
            const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
            fake.reset();
            fake.page.url = url;

            const { default: AppLayout } = await import('./AppLayout.vue');
            const host = document.createElement('div');
            document.body.append(host);
            const wrapper = mount(AppLayout, { attachTo: host, slots: { default: '<p>Página</p>' } });

            return { fake, main: wrapper.get('main').element };
        }

        afterEach(() => {
            document.body.replaceChildren();
        });

        it('a otra página, lleva el foco al contenido', async () => {
            const { fake, main } = await mountLayoutAt('/');

            fake.page.url = '/restaurants/prueba-la-ceiba';
            fake.receiveFromServer('es');

            expect(document.activeElement).toBe(main);
        });

        it('con atrás y adelante, también', async () => {
            const { fake, main } = await mountLayoutAt('/restaurants/prueba-la-ceiba');

            fake.page.url = '/?r=prueba-la-ceiba';
            fake.restoreFromHistory('es');

            expect(document.activeElement).toBe(main);
        });

        it('en la primera carga no mueve el foco: Inertia también avisa ahí', async () => {
            const { fake, main } = await mountLayoutAt('/restaurants/prueba-la-ceiba');

            fake.receiveFromServer('es');

            expect(document.activeElement).not.toBe(main);
        });

        it('si solo cambian los parámetros de la misma página, tampoco', async () => {
            const { fake, main } = await mountLayoutAt('/?r=prueba-la-ceiba');

            fake.page.url = '/';
            fake.receiveFromServer('es');

            expect(document.activeElement).not.toBe(main);
        });

        it('al volver a la página de antes, lo lleva otra vez', async () => {
            const { fake, main } = await mountLayoutAt('/');
            fake.page.url = '/restaurants/prueba-la-ceiba';
            fake.receiveFromServer('es');
            main.blur();

            fake.page.url = '/';
            fake.restoreFromHistory('es');

            expect(document.activeElement).toBe(main);
        });
    });
});
