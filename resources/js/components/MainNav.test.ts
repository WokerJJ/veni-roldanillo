import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** La navegación de la cabecera (ADR 0037) en la dirección `url`. */
async function mountNav({ locale = 'es', url = '/' }: { locale?: 'es' | 'en'; url?: string } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });
    inertia.page.url = url;

    const { default: MainNav } = await import('./MainNav.vue');

    return mount(MainNav, { attrs: { class: 'extra' } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('MainNav', () => {
    it.each([
        ['/', 'Mapa'],
        ['/?r=la-ceiba', 'Mapa'],
        ['/dishes', 'Guía de platos'],
    ])('en %s marca «%s» como la sección actual', async (url, current) => {
        const nav = (await mountNav({ url })).get('nav[data-main-nav]');

        expect(nav.attributes('aria-label')).toBe('Secciones');
        expect(nav.findAll('a').map((link) => [link.text(), link.attributes('href')])).toEqual([
            ['Mapa', '/'],
            ['Guía de platos', '/dishes'],
        ]);
        expect(nav.findAll('a[aria-current="page"]').map((link) => link.text())).toEqual([current]);
    });

    it.each(['/restaurants/la-ceiba', '/privacy'])('en %s (una ficha, un documento) no marca ninguna', async (url) => {
        const wrapper = await mountNav({ url });

        expect(wrapper.findAll('[aria-current]')).toEqual([]);
        expect(wrapper.findAll('a')).toHaveLength(2);
    });

    it('la clase que le pongan va a la navegación', async () => {
        expect((await mountNav()).get('nav').classes()).toContain('extra');
    });

    it('en inglés', async () => {
        const wrapper = await mountNav({ locale: 'en' });

        expect(wrapper.get('nav').attributes('aria-label')).toBe('Sections');
        expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Map', 'Dishes guide']);
    });

    it('los enlaces miden al menos 44 px de alto', async () => {
        const wrapper = await mountNav();

        expect(wrapper.findAll('a').every((link) => link.classes().includes('min-h-touch'))).toBe(true);
    });
});
