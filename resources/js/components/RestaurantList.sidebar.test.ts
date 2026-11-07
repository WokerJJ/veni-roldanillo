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

    it('con `pinnedFinder` el buscador, el botón de los filtros y «Sugerime algo» quedan fijos: solo se desplaza lo de abajo (el panel de los filtros, almuerzos, filas, guardado)', async () => {
        const { wrapper } = await mountInSidebar();
        const scroller = wrapper.get('[data-list-scroll]');

        // Posicionado: el encabezado del resumen, solo para el lector (sr-only, absoluto), se desplaza con él y no agranda la página.
        expect(scroller.classes()).toEqual(expect.arrayContaining(['relative', 'min-h-0', 'flex-1', 'overflow-y-auto']));
        expect(scroller.find('input[type="search"]').exists()).toBe(false);
        expect(scroller.find('[data-suggest]').exists()).toBe(false);
        expect(scroller.find('[data-filters-toggle]').exists()).toBe(false);
        expect(scroller.find('[data-filters-panel]').exists()).toBe(true);
        expect(wrapper.find('details[data-filters]').exists()).toBe(false);
        expect(wrapper.find('input[type="search"]').exists()).toBe(true);
        expect(wrapper.find('[data-suggest]').exists()).toBe(true);
        expect(scroller.find('details[data-lunches]').exists()).toBe(true);
        expect(scroller.findAll('button[data-slug]')).toHaveLength(2);
        expect(scroller.find('[data-saved-open]').exists()).toBe(true);
        // Lo único que se desplaza: ningún ancestro del buscador dentro de la lista tiene su propio scroll.
        expect(wrapper.findAll('.overflow-y-auto')).toHaveLength(1);
    });

    it('«Filtros» abre su panel arriba de lo que se desplaza, sin agrandar lo fijo: aria-expanded, aria-controls y de vuelta arriba (#130)', async () => {
        const { wrapper } = await mountInSidebar();
        const toggle = wrapper.get<HTMLButtonElement>('button[data-filters-toggle]');
        const scroller = wrapper.get<HTMLElement>('[data-list-scroll]');
        const panel = wrapper.get<HTMLElement>('[data-filters-panel]');

        // Cerrado al montar, sin filtros puestos; el panel existe para que aria-controls apunte a algo.
        expect(toggle.text()).toBe('Filtros');
        expect(toggle.classes()).toContain('min-h-touch');
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(toggle.attributes('aria-controls')).toBe(panel.attributes('id'));
        expect(panel.element.hidden).toBe(true);
        // El último de lo fijo: lo siguiente en el orden del foco es el panel.
        expect(scroller.element.firstElementChild).toBe(panel.element);
        expect(Boolean(wrapper.get('[data-suggest]').element.compareDocumentPosition(toggle.element) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

        // jsdom no desplaza: el valor queda escrito como en un navegador con la lista bajada.
        Object.defineProperty(scroller.element, 'scrollTop', { value: 300, writable: true });
        toggle.element.focus();
        await toggle.trigger('click');

        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(panel.element.hidden).toBe(false);
        expect(scroller.element.scrollTop).toBe(0);
        expect(document.activeElement).toBe(toggle.element);
        for (const control of ['open', 'delivery', 'price', 'category']) {
            expect(scroller.element.contains(wrapper.get(`[data-filter="${control}"]`).element)).toBe(true);
        }
        expect(scroller.element.contains(wrapper.get('input[type="search"]').element)).toBe(false);

        await toggle.trigger('click');
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(panel.element.hidden).toBe(true);
    });

    it('con filtros puestos, el botón los cuenta (también para el lector, en su nombre) y el panel empieza abierto', async () => {
        const { wrapper } = await mountInSidebar({ filters: { ...NO_FILTERS, open: true, price: 25_000 } });
        const toggle = wrapper.get('button[data-filters-toggle]');

        expect(toggle.text()).toBe('Filtros (2)');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(wrapper.get<HTMLElement>('[data-filters-panel]').element.hidden).toBe(false);

        await wrapper.setProps({ filters: { ...NO_FILTERS, open: true } });
        expect(toggle.text()).toBe('Filtros (1)');
    });

    it('el buscador es RestaurantSearch y los controles, FilterControls apilados: sin el <details> del celular (#130)', async () => {
        const { wrapper } = await mountInSidebar();

        expect(wrapper.findComponent({ name: 'RestaurantFilters' }).exists()).toBe(false);
        expect(wrapper.getComponent({ name: 'RestaurantSearch' }).find('input[type="search"]').exists()).toBe(true);
        const controls = wrapper.getComponent({ name: 'FilterControls' });
        expect(controls.props('stacked')).toBe(true);
        expect(controls.element).toBe(wrapper.get('[data-filters-panel]').element);
    });

    it('cambiar el precio en el panel emite el filtro y el botón pasa a contarlo', async () => {
        const { wrapper } = await mountInSidebar();
        const toggle = wrapper.get('button[data-filters-toggle]');
        await toggle.trigger('click');

        await wrapper.get('[data-filters-panel] [data-filter="price"]').setValue('25000');
        const emitted = wrapper.emitted<[Filters]>('update:filters') ?? [];
        expect(emitted.at(-1)).toEqual([{ ...NO_FILTERS, price: 25_000 }]);

        await wrapper.setProps({ filters: emitted.at(-1)?.[0] ?? null });
        expect(toggle.text()).toBe('Filtros (1)');
    });

    it('«Quitar filtros» se ve en lo fijo aunque el panel esté cerrado, también con solo la búsqueda, y el panel no lo repite', async () => {
        const { wrapper } = await mountInSidebar({ filters: { ...NO_FILTERS, query: 'sancocho' } });
        const panel = wrapper.get<HTMLElement>('[data-filters-panel]');
        expect(panel.element.hidden).toBe(true);

        expect(wrapper.findAll('[data-clear-filters]')).toHaveLength(1);
        const clear = wrapper.get('[data-clear-filters]');
        expect(clear.element.closest('[hidden]')).toBeNull();
        expect(wrapper.get('[data-list-scroll]').element.contains(clear.element)).toBe(false);

        await clear.trigger('click');
        expect(wrapper.emitted('update:filters')).toEqual([[NO_FILTERS]]);

        // Sin nada puesto, no está.
        await wrapper.setProps({ filters: NO_FILTERS });
        expect(wrapper.find('[data-clear-filters]').exists()).toBe(false);
    });

    it('tras «Quitar filtros» el foco va al botón «Filtros»: el que se pulsó desaparece', async () => {
        const { wrapper } = await mountInSidebar({ filters: { ...NO_FILTERS, delivery: true } });
        const clear = wrapper.get<HTMLButtonElement>('[data-clear-filters]');
        clear.element.focus();

        await clear.trigger('click');
        await wrapper.setProps({ filters: NO_FILTERS });
        await flushPromises();

        expect(wrapper.find('[data-clear-filters]').exists()).toBe(false);
        expect(document.activeElement).toBe(wrapper.get('button[data-filters-toggle]').element);
    });

    it('el botón «Filtros» muestra si está abierto (el chevron) y nombra al panel, un grupo', async () => {
        const { wrapper } = await mountInSidebar();
        const toggle = wrapper.get('button[data-filters-toggle]');
        const panel = wrapper.get('[data-filters-panel]');
        const chevron = () =>
            wrapper
                .findAllComponents({ name: 'Icon' })
                .filter((icon) => toggle.element.contains(icon.element as Element))
                .map((icon) => icon.props('name') as string)
                .at(-1);

        expect(panel.attributes('role')).toBe('group');
        expect(toggle.attributes('id')).toBeTruthy();
        expect(panel.attributes('aria-labelledby')).toBe(toggle.attributes('id'));
        expect(chevron()).toBe('chevron-abajo');

        await toggle.trigger('click');
        expect(chevron()).toBe('chevron-arriba');
    });

    it('con el foco en el panel, un filtro que saca al elegido de las filas (o lo devuelve) no desplaza la lista', async () => {
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        // A las 12:30 El Guadual está cerrado: «Abierto ahora» lo saca de las filas.
        const { wrapper } = await mountInSidebar({ selected: EL_GUADUAL.slug });
        await wrapper.get('button[data-filters-toggle]').trigger('click');
        wrapper.get<HTMLInputElement>('[data-filters-panel] [data-filter="open"]').element.focus();
        scroll.mockClear();

        await wrapper.setProps({ filters: { ...NO_FILTERS, open: true } });
        await flushPromises();
        expect(wrapper.find('[data-selected-outside]').exists()).toBe(true);

        await wrapper.setProps({ filters: NO_FILTERS });
        await flushPromises();
        expect(wrapper.find('[data-selected-outside]').exists()).toBe(false);
        expect(scroll).not.toHaveBeenCalled();

        // Otro elegido sí se lleva a la vista, aunque el foco siga en el panel.
        await wrapper.setProps({ selected: LA_CEIBA.slug });
        await flushPromises();
        expect(scroll).toHaveBeenCalledTimes(1);
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
