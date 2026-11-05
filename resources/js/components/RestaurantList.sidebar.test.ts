import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';

import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * La lista de la barra lateral de computador (ADR 0037): sin cerrar, sin
 * tomar el foco y con el buscador fijo arriba, con el elegido y su resumen en
 * el slot.
 */
async function mountInSidebar(
    props: { selected?: string | null; filters?: Filters | null; distances?: Record<string, number> | null } = {},
    restaurants: readonly Restaurant[] = [LA_CEIBA, EL_GUADUAL],
) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: RestaurantList } = await import('./RestaurantList.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const outside = document.createElement('button');
    document.body.prepend(outside);
    outside.focus();

    const wrapper = mount(RestaurantList, {
        props: { restaurants, pinnedFinder: true, ...props },
        slots: {
            selected: ({ restaurant, inRow }: { restaurant: Restaurant; inRow: boolean }) =>
                h('p', { 'data-summary': '', 'data-in-row': String(inRow) }, `Resumen de ${restaurant.name}`),
        },
        attachTo: host,
    });
    await flushPromises();

    return {
        wrapper,
        outside,
        item: (slug: string) => wrapper.get(`button[data-slug="${slug}"]`),
        order: () => wrapper.findAll('button[data-slug]').map((button) => button.attributes('data-slug')),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30: La Ceiba (11 a 15) abierta; El Guadual (18 a 2), cerrado.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('RestaurantList en la barra lateral', () => {
    it('sin `closable` no tiene botón de cerrar; sin `autofocus` no se lleva el foco al montarse', async () => {
        const { wrapper, outside } = await mountInSidebar();

        expect(wrapper.findAll('button').some((button) => button.attributes('aria-label')?.startsWith('Cerrar'))).toBe(false);
        expect(document.activeElement).toBe(outside);
    });

    it('con `pinnedFinder` el buscador, los filtros y «Sugerime algo» quedan fijos: solo se desplaza lo de abajo (almuerzos, filas, guardado)', async () => {
        const { wrapper } = await mountInSidebar();
        const scroller = wrapper.get('[data-list-scroll]');

        // Posicionado: el encabezado del resumen, solo para el lector (sr-only, absoluto), se desplaza con él y no agranda la página.
        expect(scroller.classes()).toEqual(expect.arrayContaining(['relative', 'min-h-0', 'flex-1', 'overflow-y-auto']));
        expect(scroller.find('input[type="search"]').exists()).toBe(false);
        expect(scroller.find('[data-suggest]').exists()).toBe(false);
        expect(wrapper.find('input[type="search"]').exists()).toBe(true);
        expect(wrapper.find('[data-suggest]').exists()).toBe(true);
        expect(scroller.find('details[data-lunches]').exists()).toBe(true);
        expect(scroller.findAll('button[data-slug]')).toHaveLength(2);
        expect(scroller.find('[data-saved-open]').exists()).toBe(true);
        // Lo único que se desplaza: ningún ancestro del buscador dentro de la lista tiene su propio scroll.
        expect(wrapper.findAll('.overflow-y-auto')).toHaveLength(1);
    });

    it('marca al elegido con aria-current y una marca que no es solo de color, y pone su resumen debajo de su fila', async () => {
        const { wrapper, item } = await mountInSidebar({ selected: EL_GUADUAL.slug });

        expect(item(EL_GUADUAL.slug).attributes('aria-current')).toBe('true');
        expect(item(EL_GUADUAL.slug).classes()).toContain('shadow-[inset_4px_0_0_currentColor]');
        expect(item(LA_CEIBA.slug).attributes('aria-current')).toBeUndefined();
        expect(item(LA_CEIBA.slug).classes()).not.toContain('shadow-[inset_4px_0_0_currentColor]');
        const summary = wrapper.get(`li[data-row="${EL_GUADUAL.slug}"] [data-summary]`);
        expect(summary.text()).toBe(`Resumen de ${EL_GUADUAL.name}`);
        // Debajo de su fila: la fila ya dice el nombre y el estado.
        expect(summary.attributes('data-in-row')).toBe('true');
        expect(wrapper.findAll('[data-summary]')).toHaveLength(1);
    });

    it('al cambiar el elegido (desde el mapa) desplaza su fila a la vista', async () => {
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        const { wrapper } = await mountInSidebar({ selected: null });
        expect(wrapper.find('[data-summary]').exists()).toBe(false);

        await wrapper.setProps({ selected: LA_CEIBA.slug });
        await flushPromises();

        expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
        expect(scroll.mock.contexts.at(-1)).toBe(wrapper.get(`li[data-row="${LA_CEIBA.slug}"]`).element);
    });

    it('si el elegido no está entre las filas (llegó desde «Platos»), su resumen va arriba de la lista, con su nombre', async () => {
        const { wrapper } = await mountInSidebar({ selected: EL_GUADUAL.slug, filters: { ...NO_FILTERS, query: 'ceiba' } });

        expect(wrapper.find(`button[data-slug="${EL_GUADUAL.slug}"]`).exists()).toBe(false);
        const summary = wrapper.get('[data-selected-outside] [data-summary]');
        expect(summary.text()).toBe(`Resumen de ${EL_GUADUAL.name}`);
        expect(summary.attributes('data-in-row')).toBe('false');
    });

    it('si el elegido está fuera de las filas, lo lleva a la vista: al elegirlo y cuando la búsqueda lo saca de las filas', async () => {
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        const { wrapper } = await mountInSidebar({ selected: null, filters: { ...NO_FILTERS, query: 'ceiba' } });

        await wrapper.setProps({ selected: EL_GUADUAL.slug });
        await flushPromises();
        expect(scroll.mock.contexts.at(-1)).toBe(wrapper.get('[data-selected-outside]').element);

        // Elegida una fila, la búsqueda la saca: su resumen sube y se ve.
        scroll.mockClear();
        await wrapper.setProps({ selected: LA_CEIBA.slug, filters: NO_FILTERS });
        await flushPromises();
        scroll.mockClear();
        await wrapper.setProps({ filters: { ...NO_FILTERS, query: 'guadual' } });
        await flushPromises();
        expect(scroll).toHaveBeenCalledTimes(1);
        expect(scroll.mock.contexts.at(-1)).toBe(wrapper.get('[data-selected-outside]').element);
    });

    it('como no se cierra, el orden «abiertos primero» se pone al día cuando cambia quién está abierto', async () => {
        const { wrapper, order } = await mountInSidebar();
        expect(order()).toEqual([LA_CEIBA.slug, EL_GUADUAL.slug]);

        // 18:30: cerró La Ceiba y abrió El Guadual.
        vi.setSystemTime(new Date('2026-10-07T18:30:00-05:00'));
        vi.advanceTimersByTime(60_000);
        await flushPromises();
        expect(wrapper.find('[data-status]').exists()).toBe(true);
        expect(order()).toEqual([EL_GUADUAL.slug, LA_CEIBA.slug]);
    });

    it('y cuando cambian las distancias: entre los abiertos, el más cerca primero', async () => {
        const later = { ...LA_CEIBA, slug: 'prueba-la-otra', name: 'La Otra' };
        const { wrapper, order } = await mountInSidebar({ distances: { [LA_CEIBA.slug]: 100, [later.slug]: 900 } }, [LA_CEIBA, later, EL_GUADUAL]);
        expect(order()).toEqual([LA_CEIBA.slug, later.slug, EL_GUADUAL.slug]);

        // Quien usa la app caminó: ahora la otra queda más cerca.
        await wrapper.setProps({ distances: { [LA_CEIBA.slug]: 800, [later.slug]: 50 } });
        await flushPromises();
        expect(order()).toEqual([later.slug, LA_CEIBA.slug, EL_GUADUAL.slug]);
    });
});
