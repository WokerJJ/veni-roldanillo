import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';

import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

import type { FinderPanel, FinderPanelOptions } from './useFinder';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Un componente de prueba que usa el composable con estos restaurantes y filtros, que la prueba cambia. */
async function mountFinder(
    restaurants: readonly Restaurant[] = [LA_CEIBA, EL_GUADUAL],
    initial: Filters | null = NO_FILTERS,
    unfiltered: FinderPanelOptions['unfiltered'] = 'count',
) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { useFinderPanel } = await import('./useFinder');
    const filters = shallowRef<Filters | null>(initial);
    const onFilters = vi.fn((fixed: Filters) => {
        filters.value = fixed;
    });
    const holder: { panel?: FinderPanel } = {};

    const wrapper = mount({
        setup() {
            const panel = useFinderPanel({ restaurants: () => restaurants, filters: () => filters.value }, { unfiltered, onFilters });
            holder.panel = panel;

            return () => h('p', panel.announced.value);
        },
    });

    if (holder.panel === undefined) {
        throw new Error('El composable no se montó.');
    }

    return { wrapper, filters, onFilters, panel: holder.panel };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11–15) abierta, El Guadual (18–02) cerrado.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useFinderPanel', () => {
    it('sin filtros cuenta todos (la lista) o no dice nada (la bienvenida)', async () => {
        expect((await mountFinder()).panel.message.value).toBe('2 restaurantes en el mapa');
        expect((await mountFinder(undefined, NO_FILTERS, 'silent')).panel.message.value).toBe('');
    });

    it('con filtros dice cuántos los cumplen de cuántos, o que ninguno', async () => {
        const { panel, filters } = await mountFinder();

        filters.value = { ...NO_FILTERS, delivery: true };
        expect(panel.matching.value.map(({ slug }) => slug)).toEqual(['prueba-la-ceiba']);
        expect(panel.message.value).toBe('1 de 2 restaurantes');

        filters.value = { ...NO_FILTERS, query: 'no existe' };
        expect(panel.message.value).toBe('Ningún restaurante cumple con lo que buscás. Probá con menos filtros.');
    });

    it('descarta una categoría que ninguno tiene, y solo esa', async () => {
        const { onFilters, filters } = await mountFinder(undefined, { ...NO_FILTERS, open: true, category: 'no-existe' });

        expect(onFilters).toHaveBeenCalledExactlyOnceWith({ ...NO_FILTERS, open: true });
        expect(filters.value).toEqual({ ...NO_FILTERS, open: true });
    });

    it('«Sugerime algo» no repite el último si hay otro abierto; sin abiertos, lo dice', async () => {
        const otro = restaurant({ slug: 'prueba-otro-abierto' });
        const { panel, filters } = await mountFinder([LA_CEIBA, otro, EL_GUADUAL]);
        vi.spyOn(Math, 'random').mockReturnValue(0);

        expect([panel.suggest(), panel.suggest(), panel.suggest()]).toEqual(['prueba-la-ceiba', 'prueba-otro-abierto', 'prueba-la-ceiba']);

        filters.value = { ...NO_FILTERS, query: 'guadual' };
        expect(panel.suggest()).toBeNull();
        expect(panel.message.value).toBe('Ahora no hay ningún restaurante abierto con estos filtros.');
    });

    describe('la región de estado (WCAG 4.1.3)', () => {
        it('al teclear, anuncia medio segundo después de la última tecla, una sola vez', async () => {
            const { wrapper, filters } = await mountFinder();

            for (const query of ['g', 'gu', 'gua']) {
                filters.value = { ...NO_FILTERS, query };
                await nextTick();
                vi.advanceTimersByTime(300);
                await nextTick();
                expect(wrapper.text()).toBe('2 restaurantes en el mapa');
            }

            vi.advanceTimersByTime(200);
            await nextTick();

            expect(wrapper.text()).toBe('1 de 2 restaurantes');
        });

        it('una casilla o un selector se anuncian enseguida', async () => {
            const { wrapper, filters } = await mountFinder();

            filters.value = { ...NO_FILTERS, delivery: true };
            await nextTick();

            expect(wrapper.text()).toBe('1 de 2 restaurantes');
        });

        it('si «Sugerime algo» falla dos veces seguidas, se vuelve a anunciar: se vacía y se reescribe', async () => {
            const { wrapper, panel } = await mountFinder([EL_GUADUAL]);

            panel.suggest();
            await nextTick();
            expect(wrapper.text()).toBe('Ahora no hay ningún restaurante abierto.');

            panel.suggest();
            await nextTick();
            const texts = [wrapper.text()];
            await nextTick();
            texts.push(wrapper.text());

            expect(texts).toEqual(['', 'Ahora no hay ningún restaurante abierto.']);
        });
    });
});

describe('useFinder', () => {
    it('la lista, la bienvenida y la capa comparten un solo reloj', async () => {
        const setInterval = vi.spyOn(globalThis, 'setInterval');
        const first = await mountFinder();
        const users = [first, await mountFinder(), await mountFinder()];

        expect(setInterval).toHaveBeenCalledOnce();

        const before = first.panel.now.value.getTime();
        vi.advanceTimersByTime(30_000);

        expect(new Set(users.map(({ panel }) => panel.now.value))).toHaveProperty('size', 1);
        expect(first.panel.now.value.getTime() - before).toBe(30_000);
    });
});
