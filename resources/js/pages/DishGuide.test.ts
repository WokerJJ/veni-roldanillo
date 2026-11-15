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
    labels: { toc: 'En esta guía', when: 'Cuándo se come', tip: 'Si venís de visita', search_link: 'Dónde lo sirven hoy' },
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

    it('cada plato con foto la muestra en su tarjeta, con el autor y la licencia; sin foto, su ícono grande (#115, #143)', async () => {
        const wrapper = await mountGuide();

        const sancocho = wrapper.get('[data-dish="sancocho-de-gallina"]');
        const photo = sancocho.get('img[data-dish-photo]');
        expect(photo.attributes('srcset')).toMatch(/480w, .+960w$/);
        // Decorativa: el nombre del plato está justo debajo.
        expect(photo.attributes('alt')).toBe('');
        expect(photo.attributes('loading')).toBe('lazy');
        expect(photo.attributes('width')).toBe('960');
        expect(photo.attributes('height')).toBe('720');
        expect(sancocho.get('[data-photo-credit]').text()).toBe('Foto: Daniestrella123 · CC BY-SA 4.0');
        expect(sancocho.find('[data-dish-icon]').exists()).toBe(false);

        const raro = wrapper.get('[data-dish="raro"]');
        const svg = raro.get('[data-dish-icon] svg');
        expect([svg.attributes('data-icon'), svg.attributes('aria-hidden'), svg.attributes('width')]).toEqual(['veni/generico', 'true', '64']);
        expect(raro.find('img').exists()).toBe(false);
        expect(raro.find('[data-photo-credit]').exists()).toBe(false);
        // El ícono no está dentro del título: el nombre del plato es solo texto.
        expect(wrapper.findAll('h3 svg')).toHaveLength(0);
    });

    it('la portada dice cuántos platos hay, lleva el título y un mosaico decorativo con las primeras fotos', async () => {
        const wrapper = await mountGuide();
        const hero = wrapper.get('[data-hero]');

        expect(hero.get('[data-count]').text()).toBe('Hay 4 platos y bebidas típicos');
        expect(hero.get('h1').text()).toBe('Guía de platos típicos');
        // Tres platos de la prueba tienen foto: el mosaico las muestra y las lee nadie.
        const mosaic = hero.get('[data-mosaic]');
        expect(mosaic.attributes('aria-hidden')).toBe('true');
        expect(mosaic.findAll('img')).toHaveLength(3);
        expect(mosaic.findAll('img').every((image) => image.attributes('alt') === '')).toBe(true);
        // La primera se pide ya (la ve quien abre la guía); no hay nada que pedir de más.
        expect(mosaic.findAll('img').map((image) => image.attributes('loading'))).toEqual(['eager', 'eager', 'eager']);
    });

    it('en inglés la portada y el crédito de la foto salen en inglés', async () => {
        const wrapper = await mountGuide('en');

        expect(wrapper.get('[data-count]').text()).toBe('4 typical dishes and drinks');
        expect(wrapper.get('[data-dish="sancocho-de-gallina"] [data-photo-credit]').text()).toBe('Photo: Daniestrella123 · CC BY-SA 4.0');
    });

    it('cada plato es una tarjeta con qué es, cuándo se come, la nota y su enlace, y las tarjetas van en una rejilla', async () => {
        const wrapper = await mountGuide();
        const card = wrapper.get('[data-dish="sancocho-de-gallina"]');

        expect(card.classes()).toContain('guide-card');
        expect(card.get('[data-summary]').text()).toBe('Una sopa espesa.');
        expect(card.find('[data-search-link]').exists()).toBe(true);
        expect(wrapper.findAll('.guide-cards')).toHaveLength(2);
        expect(wrapper.findAll('.guide-cards')[0]?.findAll('[data-dish]')).toHaveLength(2);
    });

    it('las secciones son chips con nombre que llevan a su ancla, y cada plato conserva la suya; ningún id se repite', async () => {
        const wrapper = await mountGuide();

        const toc = wrapper.get('nav[data-toc]');
        expect(toc.attributes('aria-label')).toBe('En esta guía');

        const links = toc.findAll('a');
        expect(links.map((link) => link.text())).toEqual(['Para almorzar', 'Bebidas, frutas y dulces']);
        for (const link of links) {
            // Un chip de 44 px de alto, redondo.
            expect(link.classes()).toEqual(expect.arrayContaining(['min-h-touch', 'rounded-full']));
        }

        const hrefs = links.map((link) => link.attributes('href') ?? '');
        expect(hrefs).toEqual(['#guia-almuerzo', '#guia-bebidas']);

        const ids = wrapper.findAll('[id]').map((element) => element.attributes('id'));
        expect(new Set(ids).size).toBe(ids.length);
        for (const href of [...hrefs, '#guia-sancocho-de-gallina', '#guia-arroz-atollado', '#guia-champus', '#guia-raro']) {
            expect(wrapper.find(href).exists()).toBe(true);
        }
        // Las secciones reciben el foco al saltar a ellas.
        expect(wrapper.get('#guia-almuerzo').attributes('tabindex')).toBe('-1');
        // Los id llevan prefijo: ninguno choca con el destino de «Saltar al contenido».
        expect(ids).not.toContain('contenido');
    });

    it('«Dónde lo sirven hoy» es un botón de 44 px a todo el ancho de la tarjeta, y los chips se desplazan de lado bajo la cabecera chica', async () => {
        const wrapper = await mountGuide();

        expect(wrapper.get('[data-search-link]').classes()).toEqual(expect.arrayContaining(['min-h-touch', 'w-full', 'rounded-full']));
        expect(wrapper.get('nav[data-toc]').classes()).toContain('guide-chips');
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
        expect(link.text()).toMatch(/^Dónde lo sirven hoy/);
        expect(link.get('.sr-only').text()).toBe(': Champús');
    });
});
