import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RestaurantCategory } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const CATEGORIES: RestaurantCategory[] = [
    { slug: 'asados', name: 'Asados' },
    { slug: 'comida-tipica', name: 'Comida típica' },
];

async function mountControls(props: { filters?: Filters; categories?: RestaurantCategory[]; stacked?: boolean } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: FilterControls } = await import('./FilterControls.vue');
    const wrapper = mount(FilterControls, { props: { filters: NO_FILTERS, categories: CATEGORIES, ...props } });

    return { wrapper, last: () => wrapper.emitted<[Filters]>('update:filters')?.at(-1)?.[0] };
}

enableAutoUnmount(afterEach);

/*
| Los controles de los filtros, sin el buscador ni lo que los abre: los usa
| el <details> del celular (RestaurantFilters.vue) y, apilados, el panel de la
| barra lateral de computador (RestaurantList.vue, #130).
*/
describe.each([
    ['en fila (celular)', false],
    ['apilados (barra)', true],
])('FilterControls %s', (_, stacked) => {
    it('cada casilla emite los filtros con ese cambio y lo demás igual', async () => {
        const filters = { ...NO_FILTERS, query: 'ceiba', price: 3 };
        const { wrapper, last } = await mountControls({ filters, stacked });

        await wrapper.get('[data-filter="open"]').trigger('change');
        expect(last()).toEqual({ ...filters, open: true });

        await wrapper.get('[data-filter="delivery"]').trigger('change');
        expect(last()).toEqual({ ...filters, delivery: true });
    });

    it('el precio sale como número, y «cualquiera» como null', async () => {
        const { wrapper, last } = await mountControls({ filters: { ...NO_FILTERS, price: 1 }, stacked });
        const price = wrapper.get('[data-filter="price"]');
        expect((price.element as HTMLSelectElement).value).toBe('1');

        await price.setValue('3');
        expect(last()).toEqual({ ...NO_FILTERS, price: 3 });

        await price.setValue('');
        expect(last()).toEqual({ ...NO_FILTERS, price: null });
    });

    it('el tipo de comida sale como su slug, y «cualquiera» como null', async () => {
        const { wrapper, last } = await mountControls({ filters: { ...NO_FILTERS, category: 'asados' }, stacked });
        const category = wrapper.get('[data-filter="category"]');
        expect(category.findAll('option').map((option) => option.text())).toEqual(['Todos', 'Asados', 'Comida típica']);

        await category.setValue('comida-tipica');
        expect(last()).toEqual({ ...NO_FILTERS, category: 'comida-tipica' });

        await category.setValue('');
        expect(last()).toEqual({ ...NO_FILTERS, category: null });
    });

    it('sin categorías no hay menú de tipo de comida', async () => {
        const { wrapper } = await mountControls({ categories: [], stacked });

        expect(wrapper.find('[data-filter="category"]').exists()).toBe(false);
        expect(wrapper.find('[data-filter="price"]').exists()).toBe(true);
    });

    it(stacked ? 'apilados, los dos menús comparten una fila con su rótulo arriba' : 'en fila, todo va seguido y se parte si no entra', async () => {
        const { wrapper } = await mountControls({ stacked });
        const label = wrapper.get('[data-filter="price"]').element.closest('label');

        expect(wrapper.classes()).toContain(stacked ? 'grid-cols-2' : 'flex-wrap');
        expect(label?.classList.contains('flex-col')).toBe(stacked);
    });
});
