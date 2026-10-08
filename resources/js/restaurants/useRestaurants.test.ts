import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';

import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA, restaurant, stubRestaurantsFetch } from '@/testing/restaurants';

import type { useRestaurants as UseRestaurants } from './useRestaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function setUp(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { useRestaurants } = await import('./useRestaurants');
    const used: { state?: ReturnType<typeof UseRestaurants> } = {};
    const Host: Component = {
        setup() {
            used.state = useRestaurants();

            return () => null;
        },
    };
    const wrapper = mount(Host);

    if (!used.state) {
        throw new Error('El componente no montó.');
    }

    return { inertia, wrapper, ...used.state };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('los restaurantes del inicio', () => {
    it('empieza cargando y pide la lista en el idioma de la interfaz', async () => {
        const network = stubRestaurantsFetch();
        const { status, restaurants } = await setUp('en');

        expect(status.value).toBe('loading');
        expect(restaurants.value).toEqual([]);
        expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=en']);
    });

    it('cuando llega, queda lista', async () => {
        const network = stubRestaurantsFetch();
        const { status, restaurants } = await setUp();

        network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
        await flushPromises();

        expect(status.value).toBe('ready');
        expect(restaurants.value).toEqual([LA_CEIBA, EL_GUADUAL]);
    });

    it('una lista vacía también es una respuesta: no es un error', async () => {
        stubRestaurantsFetch([]);
        const { status, restaurants } = await setUp();
        await flushPromises();

        expect(status.value).toBe('ready');
        expect(restaurants.value).toEqual([]);
    });

    it('si no llega, queda en error y lo deja escrito en la consola', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const network = stubRestaurantsFetch();
        const { status } = await setUp();

        network.last()?.fail();
        await flushPromises();

        expect(status.value).toBe('error');
        expect(error).toHaveBeenCalledOnce();
    });

    it('reintentar vuelve a pedir y, mientras tanto, vuelve a cargar', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const network = stubRestaurantsFetch();
        const { status, restaurants, retry } = await setUp();
        network.last()?.respondWith({ status: 503 });
        await flushPromises();

        retry();

        expect(status.value).toBe('loading');
        expect(network.requests).toHaveLength(2);

        network.last()?.respond([LA_CEIBA]);
        await flushPromises();

        expect(status.value).toBe('ready');
        expect(restaurants.value).toEqual([LA_CEIBA]);
    });

    describe('al cambiar el idioma', () => {
        const IN_ENGLISH = restaurant({ categories: [{ slug: 'comida-tipica', name: 'Traditional food' }] });

        it('vuelve a pedir la lista en el idioma nuevo, sin dejar de mostrar la que hay', async () => {
            const network = stubRestaurantsFetch();
            const { inertia, status, restaurants } = await setUp();
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();

            expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=es', '/api/restaurants.geojson?lang=en']);
            // El mapa no se queda sin restaurantes mientras llega la otra.
            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA]);

            network.last()?.respond([IN_ENGLISH]);
            await flushPromises();

            expect(restaurants.value).toEqual([IN_ENGLISH]);
        });

        it('si la del idioma nuevo no llega, se queda con la que había', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const network = stubRestaurantsFetch();
            const { inertia, status, restaurants } = await setUp();
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.fail();
            await flushPromises();

            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA]);
        });

        it('cancela el pedido anterior: una respuesta vieja no pisa a la nueva', async () => {
            const network = stubRestaurantsFetch();
            const { inertia, restaurants } = await setUp();
            const [spanish] = network.requests;

            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();

            expect(spanish?.signal?.aborted).toBe(true);

            network.last()?.respond([IN_ENGLISH]);
            await flushPromises();
            // La de español llega tarde.
            spanish?.respond([LA_CEIBA]);
            await flushPromises();

            expect(restaurants.value).toEqual([IN_ENGLISH]);
        });
    });

    describe('al volver la pestaña del fondo', () => {
        const HIDDEN_NOW = restaurant({ slug: 'prueba-el-samán', name: 'Restaurante de Prueba El Samán (ficticio)' });

        function setVisibility(state: 'visible' | 'hidden'): void {
            vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
            document.dispatchEvent(new Event('visibilitychange'));
        }

        /** La lista llegó con dos restaurantes y la pestaña pasó ese tiempo en el fondo. */
        async function setUpAfter(milliseconds: number) {
            const network = stubRestaurantsFetch();
            const used = await setUp();
            network.last()?.respond([LA_CEIBA, HIDDEN_NOW]);
            await flushPromises();
            vi.advanceTimersByTime(milliseconds);

            return { network, ...used };
        }

        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-10-07T12:00:00-05:00'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('pasado el minuto que dura la lista, la vuelve a pedir sin dejar de mostrar la que hay', async () => {
            const { network, status, restaurants } = await setUpAfter(61_000);

            setVisibility('visible');

            expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=es', '/api/restaurants.geojson?lang=es']);
            // Sin parpadeo: no vuelve a «cargando» ni vacía el mapa mientras llega.
            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA, HIDDEN_NOW]);

            // Mientras estaba en el fondo ocultaron una ficha: deja de verse.
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA]);
        });

        it('antes del minuto no pide nada: la lista sigue vigente', async () => {
            const { network } = await setUpAfter(30_000);

            setVisibility('visible');

            expect(network.requests).toHaveLength(1);
        });

        it('al irse al fondo no pide nada', async () => {
            const { network } = await setUpAfter(61_000);

            setVisibility('hidden');

            expect(network.requests).toHaveLength(1);
        });

        it('si ese pedido falla, se queda con la que había y lo intenta otra vez la próxima vuelta', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { network, status, restaurants } = await setUpAfter(61_000);

            setVisibility('visible');
            network.last()?.fail();
            await flushPromises();

            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA, HIDDEN_NOW]);

            setVisibility('visible');

            expect(network.requests).toHaveLength(3);
        });

        it('el minuto corre desde la última lista que llegó', async () => {
            const { network } = await setUpAfter(61_000);
            setVisibility('visible');
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            vi.advanceTimersByTime(30_000);
            setVisibility('visible');

            expect(network.requests).toHaveLength(2);
        });

        it('ya desmontado, no pide nada', async () => {
            const { network, wrapper } = await setUpAfter(61_000);
            wrapper.unmount();

            setVisibility('visible');

            expect(network.requests).toHaveLength(1);
        });
    });

    it('al desmontar cancela el pedido en curso y no deja nada escrito en la consola', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const network = stubRestaurantsFetch();
        const { wrapper, status } = await setUp();

        wrapper.unmount();
        await flushPromises();

        expect(network.last()?.signal?.aborted).toBe(true);
        expect(status.value).toBe('loading');
        expect(error).not.toHaveBeenCalled();
    });
});
