import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DishGuide } from './DishGuide.vue';
import { filtersFromUrl } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Una guía corta, con la forma que manda DishGuideController. */
const GUIDE: DishGuide = {
    title: 'Guía de platos típicos',
    intro: 'Lo que se come en el Valle.',
    note: 'La escribió el equipo de Vení.',
    labels: { toc: 'En esta guía', when: 'Cuándo se come', tip: 'Si venís de visita', search_link: 'Buscar dónde lo sirven' },
    sections: [
        {
            id: 'almuerzo',
            heading: 'Para almorzar',
            dishes: [
                {
                    id: 'sancocho-de-gallina',
                    name: 'Sancocho de gallina',
                    search: 'sancocho',
                    summary: 'Una sopa espesa.',
                    when: 'Los domingos.',
                    tip: 'Es una comida completa.',
                },
                { id: 'arroz-atollado', name: 'Arroz atollado', search: 'arroz atollado', summary: 'Arroz húmedo.', when: 'Al almuerzo.', tip: 'Es contundente.' },
            ],
        },
        {
            id: 'bebidas',
            heading: 'Bebidas, frutas y dulces',
            dishes: [
                { id: 'champus', name: 'Champús', search: 'champús', summary: 'Maíz y lulo.', when: 'En diciembre.', tip: 'Pedilo frío.' },
                { id: 'raro', name: 'Raro', search: 'a&b=c #1', summary: 'Prueba.', when: 'Nunca.', tip: 'Ninguno.' },
            ],
        },
    ],
};

async function mountGuide(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: Page } = await import('./DishGuide.vue');

    return mount(Page, { props: { guide: GUIDE } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('Guía de platos típicos', () => {
    it('lleva el título como h1 y en el título de la pestaña, con la introducción y la nota', async () => {
        const wrapper = await mountGuide();

        expect(wrapper.get('h1').text()).toBe('Guía de platos típicos');
        expect(wrapper.get('inertia-head').attributes('title')).toBe('Guía de platos típicos');
        expect(wrapper.text()).toContain('Lo que se come en el Valle.');
        expect(wrapper.get('[data-note]').text()).toBe('La escribió el equipo de Vení.');
    });

    it('vuelve al mapa en el idioma de la página', async () => {
        const wrapper = await mountGuide('en');

        const back = wrapper.get('[data-back]');
        expect(back.attributes('href')).toBe('/');
        expect(back.text()).not.toBe('');
    });

    it('cada sección es un h2 y cada plato un h3, con cuándo se come y la nota para visitantes', async () => {
        const wrapper = await mountGuide();

        const sections = wrapper.findAll('section[data-section]');
        expect(sections.map((section) => section.get('h2').text())).toEqual(['Para almorzar', 'Bebidas, frutas y dulces']);
        expect(sections[0]?.attributes('aria-labelledby')).toBe(sections[0]?.get('h2').attributes('id'));

        const sancocho = wrapper.get('[data-dish="sancocho-de-gallina"]');
        expect(sancocho.get('h3').text()).toBe('Sancocho de gallina');
        expect(sancocho.findAll('dt').map((term) => term.text())).toEqual(['Cuándo se come', 'Si venís de visita']);
        expect(sancocho.findAll('dd').map((detail) => detail.text())).toEqual(['Los domingos.', 'Es una comida completa.']);
        expect(wrapper.findAll('h3')).toHaveLength(4);
    });

    it('el índice enlaza cada sección y cada plato con anclas que existen y no se repiten', async () => {
        const wrapper = await mountGuide();

        const toc = wrapper.get('nav[data-toc]');
        expect(toc.attributes('aria-labelledby')).toBe('guia-indice');
        expect(toc.get('h2').text()).toBe('En esta guía');

        const hrefs = toc.findAll('a').map((link) => link.attributes('href') ?? '');
        expect(hrefs).toEqual([
            '#guia-almuerzo',
            '#guia-sancocho-de-gallina',
            '#guia-arroz-atollado',
            '#guia-bebidas',
            '#guia-champus',
            '#guia-raro',
        ]);

        const ids = wrapper.findAll('[id]').map((element) => element.attributes('id'));
        expect(new Set(ids).size).toBe(ids.length);
        for (const href of hrefs) {
            expect(wrapper.find(href).exists()).toBe(true);
        }
        // Los id llevan prefijo: ninguno choca con el destino de «Saltar al contenido».
        expect(ids).not.toContain('contenido');
    });

    it('cada plato busca en el inicio dónde lo sirven, con lo que busca bien escapado', async () => {
        const wrapper = await mountGuide();

        const links = wrapper.findAll('[data-search-link]');
        expect(links.map((link) => link.attributes('href'))).toEqual([
            '/?q=sancocho',
            '/?q=arroz%20atollado',
            `/?q=${encodeURIComponent('champús')}`,
            '/?q=a%26b%3Dc%20%231',
        ]);
        // El inicio las lee como búsquedas (filtersFromUrl), con el texto entero.
        expect(links.map((link) => filtersFromUrl(link.attributes('href') ?? '').query)).toEqual(['sancocho', 'arroz atollado', 'champús', 'a&b=c #1']);
    });

    it('el nombre de cada enlace de búsqueda empieza por su texto visible y dice el plato (WCAG 2.4.4 y 2.5.3)', async () => {
        const wrapper = await mountGuide();

        const link = wrapper.get('[data-dish="champus"] [data-search-link]');
        expect(link.text()).toMatch(/^Buscar dónde lo sirven/);
        expect(link.get('.sr-only').text()).toBe(': Champús');
    });
});
