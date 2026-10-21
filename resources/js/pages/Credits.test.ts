import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountCredits(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: Credits } = await import('./Credits.vue');

    return mount(Credits);
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('Créditos', () => {
    it('atribuye los datos a OpenStreetMap, con su licencia ODbL', async () => {
        const wrapper = await mountCredits();

        expect(wrapper.get('h1').text()).toBe('Créditos');
        expect(wrapper.get('inertia-head').attributes('title')).toBe('Créditos');

        const copyright = wrapper.get('[data-osm-copyright]');
        expect(copyright.attributes('href')).toBe('https://www.openstreetmap.org/copyright');
        expect(copyright.text()).toContain('© colaboradores de OpenStreetMap');
        expect(wrapper.get('[data-odbl]').attributes('href')).toBe('https://opendatacommons.org/licenses/odbl/1-0/');
        expect(wrapper.get('[data-osm]').text()).toContain('Open Database License (ODbL)');
    });

    it('dice qué se toma de OpenStreetMap y qué no', async () => {
        const text = (await mountCredits()).get('[data-osm]').text();

        expect(text).toContain('el nombre, el tipo y el punto');
        expect(text).toContain('Ningún teléfono');
    });

    it('explica cómo pedir la parte de la base que viene de OpenStreetMap', async () => {
        const wrapper = await mountCredits();

        expect(wrapper.get('[data-request]').text()).toContain('ODbL');
        expect(wrapper.get('[data-request-link]').attributes('href')).toBe('https://github.com/WokerJJ/veni-roldanillo/issues/new');
    });

    it('los enlaces de afuera se abren aparte, sin pasar quién los abrió, y lo anuncian', async () => {
        const wrapper = await mountCredits();
        const external = wrapper.findAll('a[target="_blank"]');

        expect(external).toHaveLength(3);

        for (const link of external) {
            expect(link.attributes('rel')).toBe('noopener noreferrer');
            expect(link.get('.sr-only').text()).toBe('(se abre en otra pestaña)');
        }
    });

    it('está en inglés', async () => {
        const wrapper = await mountCredits('en');

        expect(wrapper.get('h1').text()).toBe('Credits');
        expect(wrapper.get('[data-osm-copyright]').text()).toContain('© OpenStreetMap contributors');
        expect(wrapper.get('[data-request-link]').text()).toContain('Ask for it on the project repository');
    });
});
