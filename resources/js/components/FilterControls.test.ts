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

async function mountControls(props: { filters?: Filters; categories?: RestaurantCategory[]; stacked?: boolean; chips?: boolean } = {}) {
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
        const filters = { ...NO_FILTERS, query: 'ceiba', price: 40_000 };
        const { wrapper, last } = await mountControls({ filters, stacked });

        await wrapper.get('[data-filter="open"]').trigger('change');
        expect(last()).toEqual({ ...filters, open: true });

        await wrapper.get('[data-filter="delivery"]').trigger('change');
        expect(last()).toEqual({ ...filters, delivery: true });
    });

    it('el precio sale como número, y «cualquiera» como null', async () => {
        const { wrapper, last } = await mountControls({ filters: { ...NO_FILTERS, price: 15_000 }, stacked });
        const price = wrapper.get('[data-filter="price"]');
        expect((price.element as HTMLSelectElement).value).toBe('15000');

        await price.setValue('40000');
        expect(last()).toEqual({ ...NO_FILTERS, price: 40_000 });

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

describe('en píldoras (#147): el borde se desvanece del lado donde hay más', () => {
    /** Una fila de 300 px de ancho con 600 de contenido, desplazada `left`. */
    function size(element: Element, left: number): void {
        Object.defineProperties(element, {
            clientWidth: { configurable: true, value: 300 },
            scrollWidth: { configurable: true, value: 600 },
            scrollLeft: { configurable: true, writable: true, value: left },
        });
    }

    it.each([
        [0, undefined, 'true'],
        [150, 'true', 'true'],
        [300, 'true', undefined],
    ])('desplazada %d px: al principio %o, al final %o', async (left, start, end) => {
        const { wrapper } = await mountControls({ chips: true });
        size(wrapper.element as Element, left);
        await wrapper.trigger('scroll');

        expect(wrapper.attributes('data-more-start')).toBe(start);
        expect(wrapper.attributes('data-more-end')).toBe(end);
    });

    it('sin píldoras no lleva nada', async () => {
        const { wrapper } = await mountControls();
        size(wrapper.element as Element, 150);
        await wrapper.trigger('scroll');

        expect(wrapper.attributes()).not.toHaveProperty('data-more-start');
        expect(wrapper.attributes()).not.toHaveProperty('data-more-end');
    });
});

describe('en píldoras (#147, EVA-073): cuándo se mide', () => {
    /** Toda fila mide 300 px de ancho con 600 de contenido, desde antes de montarse. */
    function sizeEveryRow(): void {
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    }

    /** Un ResizeObserver de mentira que guarda su callback y lo que observa. */
    function stubResizeObserver() {
        const observer = { callback: undefined as (() => void) | undefined, observed: [] as Element[], disconnect: vi.fn() };
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    observer.callback = callback;
                }

                observe(element: Element): void {
                    observer.observed.push(element);
                }

                disconnect(): void {
                    observer.disconnect();
                }
            },
        );

        return observer;
    }

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('al montarse ya marca el final, sin que nadie desplace la fila', async () => {
        sizeEveryRow();
        const { wrapper } = await mountControls({ chips: true });

        expect(wrapper.attributes('data-more-end')).toBe('true');
        expect(wrapper.attributes()).not.toHaveProperty('data-more-start');
    });

    it('vuelve a medir cuando la fila cambia de ancho y deja de observar al desmontarse', async () => {
        const observer = stubResizeObserver();
        const { wrapper } = await mountControls({ chips: true });

        expect(observer.observed).toEqual([wrapper.element]);
        expect(wrapper.attributes()).not.toHaveProperty('data-more-end');

        sizeEveryRow();
        observer.callback?.();
        await wrapper.vm.$nextTick();
        expect(wrapper.attributes('data-more-end')).toBe('true');

        wrapper.unmount();
        expect(observer.disconnect).toHaveBeenCalledOnce();
    });

    it('sin píldoras no observa nada', async () => {
        const observer = stubResizeObserver();
        await mountControls();

        expect(observer.callback).toBeUndefined();
    });

    it('vuelve a medir al actualizarse (otro filtro, llegan las categorías)', async () => {
        const { wrapper } = await mountControls({ chips: true, categories: [] });
        expect(wrapper.attributes()).not.toHaveProperty('data-more-end');

        sizeEveryRow();
        await wrapper.setProps({ categories: CATEGORIES });
        await wrapper.vm.$nextTick();

        expect(wrapper.attributes('data-more-end')).toBe('true');
    });
});
