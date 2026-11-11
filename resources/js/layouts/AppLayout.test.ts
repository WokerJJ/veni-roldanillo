import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, inject } from 'vue';

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
        // La atribución de OpenStreetMap (ADR 0021), en cada página con pie.
        expect(wrapper.get('footer [data-credits]').attributes('href')).toBe('/credits');
    });

    it('el pie enlaza la guía de platos típicos, que baja con los documentos legales (#21)', async () => {
        const wrapper = await mountLayout();
        await vi.dynamicImportSettled();

        const guide = wrapper.get('footer [data-dish-guide-link]');
        expect(guide.attributes('href')).toBe('/dishes');
        expect(guide.text()).toBe('Guía de platos típicos');
    });

    it('el pie enlaza los tres documentos legales en una navegación con nombre, que baja aparte (#23)', async () => {
        const wrapper = await mountLayout();
        await vi.dynamicImportSettled();
        const nav = wrapper.get('footer nav[data-legal-links]');

        expect(nav.attributes('aria-label')).toBe('Documentos legales');
        expect(nav.findAll('a').map((link) => link.attributes('href'))).toEqual(['/privacy', '/terms', '/reviews-policy']);
        expect(nav.get('[data-legal-link="privacy"]').text()).toBe('Tratamiento de datos personales');
    });

    it('en modo inmersivo ocupa justo el alto de la pantalla, sin pie de página', async () => {
        const wrapper = await mountLayout({ immersive: true });

        expect(wrapper.classes()).toContain('h-dvh');
        expect(wrapper.classes()).not.toContain('min-h-dvh');
        expect(wrapper.find('footer').exists()).toBe(false);
        // La página se posiciona contra <main>, que no crece más que el espacio que queda.
        expect(wrapper.get('main').classes()).toEqual(expect.arrayContaining(['relative', 'min-h-0', 'flex-1']));
    });

    it('la cabecera es baja en el celular y, con el mapa, va a lo ancho con el margen del panel', async () => {
        const immersive = (await mountLayout({ immersive: true })).get('header > div');
        // 46 px del selector de idioma y 2 arriba y abajo; desde 768 px, 8.
        // El margen de 16 px (veni-safe-x) crece con la isla del iPhone acostado (#139, EVA-071).
        expect(immersive.classes()).toEqual(expect.arrayContaining(['veni-safe-x', 'py-0.5', 'md:py-2']));
        expect(immersive.classes()).not.toContain('max-w-6xl');

        // Las demás páginas siguen centradas, al ancho de la ficha en dos columnas (ADR 0038): el logo queda sobre el nombre.
        expect((await mountLayout()).get('header > div').classes()).toEqual(expect.arrayContaining(['mx-auto', 'max-w-6xl']));
        expect((await mountLayout()).get('footer > div').classes()).toEqual(expect.arrayContaining(['mx-auto', 'max-w-6xl']));
    });

    it.each([false, true])('con immersive=%s la cabecera trae «Mapa · Guía de platos» desde 1024 px, que baja aparte (ADR 0037; #139)', async (immersive) => {
        const wrapper = await mountLayout({ immersive });
        await vi.dynamicImportSettled();
        const nav = wrapper.get('header nav[data-main-nav]');

        expect(nav.attributes('aria-label')).toBe('Secciones');
        // Cuándo se ve lo dice su CSS (MainNav.vue): por debajo de 1024 px va la barra de pestañas.
        expect(nav.classes()).toEqual(['main-nav']);
        expect(nav.findAll('a').map((link) => link.attributes('href'))).toEqual(['/', '/dishes']);
        // La dirección de mentira es el inicio.
        expect(nav.get('a[aria-current="page"]').text()).toBe('Mapa');
    });

    it.each([false, true])('con immersive=%s conserva la cabecera y el destino de «Saltar al contenido»', async (immersive) => {
        const wrapper = await mountLayout({ immersive });

        expect(wrapper.get('a[href="#contenido"]').text()).toBe('Saltar al contenido');
        expect(wrapper.get('main').attributes('id')).toBe('contenido');
        expect(wrapper.get('header').findAll('button').length).toBeGreaterThan(0);
    });

    describe('el celular (#139, ADR 0041)', () => {
        it('con el mapa, la cabecera se esconde por debajo de 1024 px: el mapa llega arriba', async () => {
            expect((await mountLayout({ immersive: true })).get('header').classes()).toContain('max-lg:hidden');
            expect((await mountLayout()).get('header').classes()).not.toContain('max-lg:hidden');
        });

        it('en las demás páginas la cabecera del celular conserva el logo y el idioma (quien llega por un enlace lo cambia ahí); el tema va en «Ajustes» (#147, EVA-072)', async () => {
            const header = (await mountLayout()).get('header');
            const hiddenOnPhone = (element: Element) => element.closest('[class~="max-lg:hidden"]') !== null;
            // El idioma es el grupo de botones; el tema, el botón de la cabecera fuera de ese grupo.
            const theme = header.findAll('button').filter((button) => button.element.closest('[role="group"]') === null);

            expect(hiddenOnPhone(header.get('[role="group"]').element)).toBe(false);
            expect(theme.length).toBeGreaterThan(0);
            expect(theme.every((button) => hiddenOnPhone(button.element))).toBe(true);
            expect(hiddenOnPhone(header.get('a[href="/"]').element)).toBe(false);
        });

        it('la cabecera es la que baja el margen del sistema arriba (el selector de TabBar.vue, mobileBase.test.ts)', async () => {
            expect((await mountLayout()).get('header').element.matches("a[href='#contenido'] + header")).toBe(true);
        });

        it.each([false, true])('con immersive=%s trae la barra de pestañas, que baja aparte; la cabecera chica y el espaciador, solo fuera del mapa', async (immersive) => {
            const wrapper = await mountLayout({ immersive });
            expect(wrapper.find('nav[data-tabbar]').exists()).toBe(false);
            await vi.dynamicImportSettled();
            await flushPromises();

            const bar = wrapper.get('nav[data-tabbar]');
            expect(bar.attributes('aria-label')).toBe('Secciones');
            expect(wrapper.find('.tabbar-spacer').exists()).toBe(!immersive);
            expect(wrapper.find('[data-compact-header]').exists()).toBe(!immersive);
        });

        it('le da al inicio el idioma y el tema para sus «Ajustes»', async () => {
            const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
            fake.reset();
            const { SETTINGS } = await import('@/navigation/tabs');
            const { default: AppLayout } = await import('./AppLayout.vue');
            const Page = defineComponent({
                setup: () => () => h('p', { 'data-controls': inject(SETTINGS, []).length }),
            });
            const wrapper = mount(AppLayout, { slots: { default: () => h(Page) } });

            expect(wrapper.get('[data-controls]').attributes('data-controls')).toBe('2');
        });
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
