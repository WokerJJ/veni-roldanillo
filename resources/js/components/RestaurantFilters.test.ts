import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Filters } from '@/restaurants/filterParams';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountFinder(filters: Filters = NO_FILTERS) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: RestaurantFilters } = await import('./RestaurantFilters.vue');
    const wrapper = mount(RestaurantFilters, {
        props: { filters, categories: [{ slug: 'asados', name: 'Asados' }] },
        attachTo: document.body,
    });

    return { wrapper, chips: () => wrapper.get('[data-filters]') };
}

enableAutoUnmount(afterEach);

afterEach(() => {
    document.body.replaceChildren();
});

/*
| El buscador y los filtros del celular (y del lateral de siempre, por debajo
| de 1024 px, #139): el buscador (RestaurantSearch) y los controles en una
| fila de píldoras que se desplaza de lado, siempre a la vista.
*/
describe('RestaurantFilters', () => {
    it('muestra el buscador y los filtros como píldoras en un grupo con nombre, sin «Quitar filtros»', async () => {
        const { wrapper, chips } = await mountFinder();

        expect(wrapper.getComponent({ name: 'RestaurantSearch' }).find('input[type="search"]').exists()).toBe(true);
        expect(wrapper.find('details').exists()).toBe(false);
        expect(chips().attributes('role')).toBe('group');
        expect(chips().attributes('aria-label')).toBe('Filtros');
        expect(chips().attributes('data-chips')).toBe('true');
        expect(chips().findAll('label').map((label) => label.text())).toEqual([
            'Abierto ahora',
            'Hace domicilios',
            expect.stringMatching(/^Precio/),
            expect.stringMatching(/^Tipo de comida/),
        ]);
        expect(wrapper.find('[data-clear-filters]').exists()).toBe(false);
    });

    it('con filtros puestos los marca y «Quitar filtros» los saca todos', async () => {
        const { wrapper, chips } = await mountFinder({ ...NO_FILTERS, delivery: true, price: 15_000 });

        expect(chips().get<HTMLInputElement>('[data-filter="delivery"]').element.checked).toBe(true);
        expect(chips().get<HTMLSelectElement>('[data-filter="price"]').element.value).toBe('15000');

        await wrapper.get('[data-clear-filters]').trigger('click');
        expect(wrapper.emitted('update:filters')).toEqual([[NO_FILTERS]]);
    });

    it('con solo la búsqueda, «Quitar filtros» está', async () => {
        const { wrapper } = await mountFinder({ ...NO_FILTERS, query: 'sancocho' });

        expect(wrapper.find('[data-clear-filters]').exists()).toBe(true);
    });

    it('cambiar una píldora emite los filtros nuevos', async () => {
        const { wrapper, chips } = await mountFinder();

        await chips().get('[data-filter="price"]').setValue('15000');
        await chips().get('[data-filter="open"]').trigger('change');
        expect(wrapper.emitted('update:filters')).toEqual([[{ ...NO_FILTERS, price: 15_000 }], [{ ...NO_FILTERS, open: true }]]);
    });
});
