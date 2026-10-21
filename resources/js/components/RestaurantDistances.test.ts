import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';

import type { MapHandle } from '@/map/engine';
import type { LocateEvent } from '@/map/locate';
import { MAP_CONTEXT } from '@/map/useMapLayers';
import { EL_GUADUAL, LA_CEIBA } from '@/testing/restaurants';

import RestaurantDistances from './RestaurantDistances.vue';

const PARQUE: [number, number] = [-76.1565, 4.4105];

/** Las distancias dentro de un mapa de mentira que solo sabe avisar la ubicación. */
function mountDistances() {
    let listener: ((event: LocateEvent) => void) | null = null;
    const stop = vi.fn();
    const handle = {
        watchPosition: vi.fn((next: (event: LocateEvent) => void) => {
            listener = next;

            return stop;
        }),
        requestPosition: vi.fn(),
    };
    const map = shallowRef<MapHandle | null>(handle as unknown as MapHandle);
    const restaurants = shallowRef([LA_CEIBA, EL_GUADUAL]);
    const onDistances = vi.fn();
    const wrapper = mount(() => h(RestaurantDistances, { restaurants: restaurants.value, onDistances }), {
        global: { provide: { [MAP_CONTEXT as symbol]: { map } } },
    });

    return { wrapper, handle, stop, map, restaurants, onDistances, locate: (event: LocateEvent) => listener?.(event) };
}

enableAutoUnmount(afterEach);

describe('RestaurantDistances', () => {
    it('no pide la ubicación ni pinta nada: sin ubicación, la lista va sin distancias', () => {
        const { wrapper, handle, onDistances } = mountDistances();

        expect(handle.requestPosition).not.toHaveBeenCalled();
        expect(handle.watchPosition).toHaveBeenCalledTimes(1);
        expect(onDistances).toHaveBeenLastCalledWith(null);
        expect(wrapper.text()).toBe('');
    });

    it('con la ubicación, da solo los metros hasta cada restaurante, nunca la posición', () => {
        const { locate, onDistances } = mountDistances();

        locate({ type: 'position', at: PARQUE });

        expect(onDistances).toHaveBeenLastCalledWith({ 'prueba-la-ceiba': 320, 'prueba-el-guadual': 290 });
        expect(JSON.stringify(onDistances.mock.calls)).not.toContain('4.4105');
    });

    it('un problema de señal deja las últimas; apagar «¿Dónde estoy?» las quita', () => {
        const { locate, onDistances } = mountDistances();
        locate({ type: 'position', at: PARQUE });
        onDistances.mockClear();

        locate({ type: 'problem', problem: 'signal' });
        expect(onDistances).not.toHaveBeenCalled();

        locate({ type: 'off' });
        expect(onDistances).toHaveBeenLastCalledWith(null);
    });

    it('con otra lista, recalcula desde la misma ubicación', async () => {
        const { locate, onDistances, restaurants } = mountDistances();
        locate({ type: 'position', at: PARQUE });

        restaurants.value = [LA_CEIBA];
        await nextTick();

        expect(onDistances).toHaveBeenLastCalledWith({ 'prueba-la-ceiba': 320 });
    });

    it('al cerrarse la lista deja de escuchar la ubicación', () => {
        const { wrapper, stop } = mountDistances();

        wrapper.unmount();

        expect(stop).toHaveBeenCalledTimes(1);
    });
});
