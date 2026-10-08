import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuSection } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Un menú de ejemplo: dos secciones, con un plato agotado y otro sin descripción. */
const MENU: MenuSection[] = [
    {
        name: 'Platos fuertes (prueba)',
        dishes: [
            { name: 'Sancocho de prueba', description: 'Con arroz y aguacate.', price: 18500, sold_out: false },
            { name: 'Bandeja de prueba', description: null, price: 22000, sold_out: true },
        ],
    },
    {
        name: 'Bebidas (prueba)',
        dishes: [{ name: 'Jugo de prueba', description: 'En agua o en leche.', price: 4000, sold_out: false }],
    },
];

async function mountMenu(sections: MenuSection[] = MENU, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantMenu } = await import('./RestaurantMenu.vue');
    const wrapper = mount(RestaurantMenu, { props: { sections } });

    return {
        wrapper,
        sections: () => wrapper.findAll('[data-section]'),
        dishes: () => wrapper.findAll('[data-dish]'),
        // El espacio que no parte la línea de «$ 18.500» se compara como uno común.
        prices: () => wrapper.findAll('[data-price]').map((price) => price.text().replaceAll(' ', ' ')),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('RestaurantMenu', () => {
    it('muestra las secciones en el orden del restaurante, cada una con sus platos', async () => {
        const { sections } = await mountMenu();

        expect(sections().map((section) => section.get('h3').text())).toEqual(['Platos fuertes (prueba)', 'Bebidas (prueba)']);
        expect(sections().map((section) => section.findAll('[data-name]').map((name) => name.text()))).toEqual([
            ['Sancocho de prueba', 'Bandeja de prueba'],
            ['Jugo de prueba'],
        ]);
    });

    it.each([
        ['es', ['$ 18.500', '$ 22.000', '$ 4.000']],
        ['en', ['COP 18,500', 'COP 22,000', 'COP 4,000']],
    ] as const)('en %s, cada plato lleva su precio en pesos como se escribe en ese idioma', async (locale, expected) => {
        const { prices } = await mountMenu(MENU, locale);

        expect(prices()).toEqual(expected);
    });

    it('muestra la descripción del plato, y sin descripción no deja el hueco', async () => {
        const { dishes } = await mountMenu();

        expect(dishes()[0]?.get('[data-description]').text()).toBe('Con arroz y aguacate.');
        expect(dishes()[1]?.find('[data-description]').exists()).toBe(false);
    });

    describe('agotado hoy', () => {
        it.each([
            ['es', 'Agotado hoy'],
            ['en', 'Sold out today'],
        ] as const)('en %s, el plato agotado sigue en el menú con su aviso y su precio', async (locale, text) => {
            const { dishes } = await mountMenu(MENU, locale);
            const soldOut = dishes()[1];

            expect(soldOut?.get('[data-name]').text()).toBe('Bandeja de prueba');
            expect(soldOut?.get('[data-sold-out]').text()).toBe(text);
            expect(soldOut?.find('[data-price]').exists()).toBe(true);
        });

        it('los que hay no llevan el aviso', async () => {
            const { wrapper } = await mountMenu();

            expect(wrapper.findAll('[data-sold-out]')).toHaveLength(1);
        });

        it('no lo dice solo con el color: el aviso es texto', async () => {
            const { dishes } = await mountMenu();

            expect(dishes()[1]?.get('[data-name]').classes()).toContain('text-ink-muted');
            expect(dishes()[1]?.text()).toContain('Agotado hoy');
        });
    });

    describe('sin menú', () => {
        it.each([
            ['es', 'Este restaurante todavía no tiene el menú cargado.'],
            ['en', "This restaurant hasn't added its menu yet."],
        ] as const)('en %s lo dice, con el título de la sección y sin listas vacías', async (locale, text) => {
            const { wrapper } = await mountMenu([], locale);

            expect(wrapper.get('[data-empty]').text()).toBe(text);
            expect(wrapper.find('h2').exists()).toBe(true);
            expect(wrapper.find('h3').exists()).toBe(false);
            expect(wrapper.find('ul').exists()).toBe(false);
        });

        it('con menú no sale el aviso', async () => {
            const { wrapper } = await mountMenu();

            expect(wrapper.find('[data-empty]').exists()).toBe(false);
        });
    });

    describe('accesibilidad', () => {
        it.each([
            ['es', 'Menú'],
            ['en', 'Menu'],
        ] as const)('en %s es una sección con título de segundo nivel', async (locale, title) => {
            const { wrapper } = await mountMenu(MENU, locale);

            expect(wrapper.get('h2').text()).toBe(title);
            expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
        });

        it('cada sección del menú es un título de tercer nivel que nombra su lista de platos', async () => {
            const { sections } = await mountMenu();
            const ids = sections().map((section) => section.get('h3').attributes('id'));

            expect(new Set(ids).size).toBe(2);
            expect(sections().map((section) => section.get('ul').attributes('aria-labelledby'))).toEqual(ids);
        });
    });
});
