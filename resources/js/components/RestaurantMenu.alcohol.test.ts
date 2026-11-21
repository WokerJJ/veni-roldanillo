import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuSection } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| Las bebidas alcohólicas en la carta de la ficha (ADR 0050): un «+18» en el
| plato y una nota en la sección que tenga alguna. Sin alcohol, la carta no
| cambia.
*/

const MENU: MenuSection[] = [
    {
        name: 'Almuerzos (prueba)',
        dishes: [{ name: 'Sancocho de prueba', description: null, price: 18000, sold_out_until: null, groups: [] }],
    },
    {
        name: 'Cervezas (prueba)',
        dishes: [
            { name: 'Cerveza de prueba', description: null, price: 4500, alcohol: true, sold_out_until: null, groups: [] },
            { name: 'Malta de prueba', description: null, price: 3000, alcohol: false, sold_out_until: null, groups: [] },
        ],
    },
];

async function mountMenu(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantMenu } = await import('./RestaurantMenu.vue');

    return mount(RestaurantMenu, { props: { sections: MENU, slug: null }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('RestaurantMenu con bebidas alcohólicas', () => {
    it('marca el plato con «+18» y avisa en su sección', async () => {
        const wrapper = await mountMenu();
        const sections = wrapper.findAll('[data-section]');
        const beers = sections[1];

        expect(beers?.findAll('[data-alcohol]')).toHaveLength(1);
        expect(beers?.find('[data-alcohol]').text()).toBe('+18');
        expect(beers?.find('[data-alcohol]').attributes('aria-label')).toBe('Bebidas alcohólicas: solo para mayores de 18 años.');
        expect(beers?.find('[data-alcohol-note]').text()).toBe('Bebidas alcohólicas: solo para mayores de 18 años.');
    });

    it('la sección sin alcohol queda como estaba', async () => {
        const wrapper = await mountMenu();
        const lunch = wrapper.findAll('[data-section]')[0];

        expect(lunch?.find('[data-alcohol]').exists()).toBe(false);
        expect(lunch?.find('[data-alcohol-note]').exists()).toBe(false);
    });

    it('el plato marcado en falso no lleva el «+18»', async () => {
        const wrapper = await mountMenu();
        const dishes = wrapper.findAll('[data-section]')[1]?.findAll('[data-dish]');

        expect(dishes?.[1]?.find('[data-alcohol]').exists()).toBe(false);
    });

    it('en inglés, el aviso sale en inglés', async () => {
        const wrapper = await mountMenu('en');

        expect(wrapper.find('[data-alcohol-note]').text()).toBe('Alcoholic drinks: only for people over 18.');
        expect(wrapper.find('[data-alcohol]').text()).toBe('18+');
    });
});
