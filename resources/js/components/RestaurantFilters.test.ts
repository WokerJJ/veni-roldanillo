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

    return { wrapper, details: () => wrapper.get<HTMLDetailsElement>('details[data-filters]') };
}

enableAutoUnmount(afterEach);

afterEach(() => {
    document.body.replaceChildren();
});

/*
| El buscador y los filtros del celular (y del lateral de siempre, por debajo
| de 1024 px): el buscador (RestaurantSearch) y los controles en un <details>.
*/
describe('RestaurantFilters', () => {
    it('sin filtros, el <details> empieza cerrado, sin contar ni «Quitar filtros»', async () => {
        const { wrapper, details } = await mountFinder();

        expect(wrapper.getComponent({ name: 'RestaurantSearch' }).find('input[type="search"]').exists()).toBe(true);
        expect(details().element.open).toBe(false);
        expect(details().get('summary').text()).toBe('Filtros');
        expect(wrapper.find('[data-clear-filters]').exists()).toBe(false);
    });

    it('con filtros puestos empieza abierto y los cuenta; «Quitar filtros» se ve aunque se cierre', async () => {
        const { wrapper, details } = await mountFinder({ ...NO_FILTERS, delivery: true, price: 25_000 });

        expect(details().element.open).toBe(true);
        expect(details().get('summary').text()).toBe('Filtros (2)');

        details().element.open = false;
        const clear = wrapper.get('[data-clear-filters]');
        expect(details().element.contains(clear.element)).toBe(false);

        await clear.trigger('click');
        expect(wrapper.emitted('update:filters')).toEqual([[NO_FILTERS]]);
    });

    it('con solo la búsqueda, «Quitar filtros» está y el <details> no se abre', async () => {
        const { wrapper, details } = await mountFinder({ ...NO_FILTERS, query: 'sancocho' });

        expect(details().element.open).toBe(false);
        expect(wrapper.find('[data-clear-filters]').exists()).toBe(true);
    });

    it('cambiar un control del <details> emite los filtros nuevos', async () => {
        const { wrapper } = await mountFinder();

        await wrapper.get('details [data-filter="price"]').setValue('15000');
        expect(wrapper.emitted('update:filters')).toEqual([[{ ...NO_FILTERS, price: 15_000 }]]);
    });
});
