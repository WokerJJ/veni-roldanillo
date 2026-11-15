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
        // Las de las fotos de la guía tienen su propia prueba: aquí, las de OpenStreetMap.
        const external = wrapper.findAll('a[target="_blank"]').filter((link) => link.element.closest('[data-photos]') === null);

        expect(external).toHaveLength(3);

        for (const link of external) {
            expect(link.attributes('rel')).toBe('noopener noreferrer');
            expect(link.get('.sr-only').text()).toBe('(se abre en otra pestaña)');
        }
    });

    it('enlaza los tres documentos legales a las rutas del servidor (#23)', async () => {
        const wrapper = await mountCredits();

        // Las de routes/web.php: legal.privacy, legal.terms y legal.reviews,
        // las mismas que LEGAL_DOCUMENTS (LegalLinks.test.ts).
        expect(wrapper.findAll('[data-legal-links] a').map((link) => link.attributes('href'))).toEqual(['/privacy', '/terms', '/reviews-policy']);
    });

    it('está en inglés', async () => {
        const wrapper = await mountCredits('en');

        expect(wrapper.get('h1').text()).toBe('Credits');
        expect(wrapper.get('[data-osm-copyright]').text()).toContain('© OpenStreetMap contributors');
        expect(wrapper.get('[data-request-link]').text()).toContain('Ask for it on the project repository');
    });

    it('da el crédito de cada foto de la guía de platos: autor, licencia y su página en Wikimedia Commons (#143)', async () => {
        const wrapper = await mountCredits();
        const section = wrapper.get('[data-photos]');

        expect(section.attributes('id')).toBe('fotos');
        expect(section.get('h2').text()).toBe('Fotos de la guía de platos');
        expect(section.text()).toContain('CC BY-SA se comparten con esa misma licencia');

        const cholado = section.get('[data-photo-credit="cholado"]');
        expect(cholado.get('a').attributes('href')).toBe('https://commons.wikimedia.org/wiki/File:Cholado_jamundi.jpg');
        expect(cholado.text()).toContain('C arango');
        // Dominio público: sin enlace a una licencia.
        expect(cholado.findAll('a')).toHaveLength(1);

        const sancocho = section.get('[data-photo-credit="sancocho-de-gallina"]');
        expect(sancocho.findAll('a').map((link) => link.attributes('href'))).toEqual([
            'https://commons.wikimedia.org/wiki/File:Sancocho_de_gallina_yopal.jpg',
            'https://creativecommons.org/licenses/by-sa/4.0/',
        ]);
        // Los enlaces de afuera se abren aparte y lo anuncian.
        for (const link of sancocho.findAll('a')) {
            expect(link.attributes('target')).toBe('_blank');
            expect(link.attributes('rel')).toBe('noopener noreferrer');
            expect(link.get('.sr-only').text()).toBe('(se abre en otra pestaña)');
        }
        expect(section.findAll('li')).toHaveLength(14);
    });
});
