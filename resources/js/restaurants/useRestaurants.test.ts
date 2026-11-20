import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import { watch } from 'vue';

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

/** Deja pasar el fallo del pedido y la bajada del módulo de la copia guardada (#144). */
async function settle(): Promise<void> {
    // El import() del módulo termina en otra vuelta del reloj, no en una microtarea: se le dan varias.
    for (let round = 0; round < 5; round += 1) {
        await flushPromises();
        await vi.dynamicImportSettled();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await flushPromises();
}

enableAutoUnmount(afterEach);

// Una lista que llegó se guarda con un import() que puede terminar después de la prueba: se espera, para que no caiga en la siguiente.
afterEach(async () => {
    await settle();
    window.localStorage.clear();
});

beforeEach(() => {
    vi.resetModules();
    // La copia guardada (#144) es del teléfono: ninguna prueba hereda la de otra.
    window.localStorage.clear();
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
        await settle();

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

    describe('sin señal (#144)', () => {
        const NOW = new Date('2026-10-07T12:00:00-05:00').getTime();

        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
        });

        it('cada lista que llega se guarda en el teléfono', async () => {
            const network = stubRestaurantsFetch();
            await setUp();
            network.last()?.respond([LA_CEIBA]);
            await settle();

            const { loadSaved } = await import('./savedList');

            expect(loadSaved()?.restaurants).toEqual([LA_CEIBA]);
        });

        it('sin lista a la vista, muestra la guardada con su hora, y no es un error', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA, EL_GUADUAL], NOW - 3_600_000);
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);

            const network = stubRestaurantsFetch();
            const { status, restaurants, staleSince } = await setUp();
            network.last()?.fail();
            await settle();
            vi.useRealTimers();

            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA, EL_GUADUAL]);
            expect(staleSince.value).toBe(NOW - 3_600_000);
        });

        it('sin lista a la vista ni guardada, es el error de siempre', async () => {
            const network = stubRestaurantsFetch();
            const { status, staleSince } = await setUp();
            network.last()?.fail();
            await settle();

            expect(status.value).toBe('error');
            expect(staleSince.value).toBeNull();
        });

        it('con la señal de vuelta (reintentar), llega la de verdad y el aviso se va', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { staleSince, restaurants, retry } = await setUp();
            network.last()?.fail();
            await settle();

            expect(staleSince.value).not.toBeNull();

            retry();
            network.last()?.respond([EL_GUADUAL]);
            await flushPromises();

            expect(staleSince.value).toBeNull();
            expect(restaurants.value).toEqual([EL_GUADUAL]);
        });

        it('sin respuesta del servidor (red o plazo), es «sin señal»; con una respuesta de error, no (BUG-005)', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { staleSince, offline, retry } = await setUp();
            network.last()?.fail();
            await settle();

            expect(staleSince.value).not.toBeNull();
            expect(offline.value).toBe(true);

            retry();
            network.last()?.respondWith({ status: 503 });
            await settle();

            // Sigue la copia, pero el teléfono tiene señal: el aviso no puede decir «sin señal».
            expect(staleSince.value).not.toBeNull();
            expect(offline.value).toBe(false);
        });

        it('si el servidor responde 200 pero ningún elemento es válido, la copia buena no se borra (BUG-005)', async () => {
            const { saveList, loadSaved } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { status, restaurants, staleSince, offline } = await setUp();
            network.last()?.respondWith({ status: 200, body: { type: 'FeatureCollection', features: [{ roto: true }] } });
            await settle();

            expect(loadSaved()?.restaurants).toEqual([LA_CEIBA]);
            expect(status.value).toBe('ready');
            expect(restaurants.value).toEqual([LA_CEIBA]);
            expect(staleSince.value).not.toBeNull();
            expect(offline.value).toBe(false);
        });

        it('si el servidor dice que no hay restaurantes (features vacío), la copia sí se borra', async () => {
            const { saveList, loadSaved } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            stubRestaurantsFetch([]);
            await setUp();
            await settle();

            expect(loadSaved()).toBeNull();
        });

        it('al reintentar con la copia a la vista, `retrying` dura lo que el pedido y el aviso sigue si vuelve a fallar (EVA-015)', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { retrying, staleSince, restaurants, retry } = await setUp();
            network.last()?.fail();
            await settle();

            expect(retrying.value).toBe(false);

            retry();

            expect(retrying.value).toBe(true);

            network.last()?.fail();
            await settle();

            expect(retrying.value).toBe(false);
            expect(staleSince.value).not.toBeNull();

            retry();
            network.last()?.respond([EL_GUADUAL]);
            await settle();

            expect(retrying.value).toBe(false);
            expect(staleSince.value).toBeNull();
            expect(restaurants.value).toEqual([EL_GUADUAL]);
        });

        it('`retrying` no se queda pegado si el pedido se cancela por el cambio de idioma (EVA-015)', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { inertia, retrying, retry } = await setUp();
            network.last()?.fail();
            await settle();

            retry();
            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.respond([EL_GUADUAL]);
            await settle();

            expect(retrying.value).toBe(false);
        });

        it('la copia en otro idioma que la interfaz sirve la lista, pero sin categorías ni almuerzo', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [LA_CEIBA, EL_GUADUAL], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { status, restaurants } = await setUp('en');
            network.last()?.fail();
            await settle();

            expect(status.value).toBe('ready');
            expect(restaurants.value.map(({ slug }) => slug)).toEqual([LA_CEIBA.slug, EL_GUADUAL.slug]);
            expect(restaurants.value.every(({ categories, lunch }) => categories.length === 0 && lunch === null)).toBe(true);
        });

        it('la lista se guarda con el idioma en que se pidió, aunque la interfaz cambie antes de guardarla', async () => {
            const network = stubRestaurantsFetch();
            const { inertia, status } = await setUp('es');
            // La interfaz cambia de idioma justo cuando llega la lista, antes de que baje el módulo que la guarda.
            watch(status, () => {
                inertia.receiveFromServer('en', { replace: true });
            }, { flush: 'sync' });
            network.last()?.respond([LA_CEIBA]);
            await settle();

            const { loadSaved } = await import('./savedList');

            expect(loadSaved()?.locale).toBe('es');
        });

        it('si el módulo de la copia guardada no baja, es el error de siempre y nada queda sin manejar', async () => {
            vi.doMock('./savedList', () => {
                throw new Error('chunk roto');
            });
            const unhandled = vi.fn();
            process.on('unhandledRejection', unhandled);

            const network = stubRestaurantsFetch();
            const { status, staleSince } = await setUp();
            network.last()?.fail();
            await settle();
            await new Promise((resolve) => setTimeout(resolve, 0));
            process.off('unhandledRejection', unhandled);
            vi.doUnmock('./savedList');

            expect(status.value).toBe('error');
            expect(staleSince.value).toBeNull();
            expect(unhandled).not.toHaveBeenCalled();
        });

        it('una lista de ahora que falla al volver a pedir no se cambia por la guardada', async () => {
            const { saveList } = await import('./savedList');
            saveList('es', [EL_GUADUAL], Date.now() - 60_000);

            const network = stubRestaurantsFetch();
            const { inertia, restaurants, staleSince } = await setUp();
            network.last()?.respond([LA_CEIBA]);
            await settle();
            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.fail();
            await settle();

            expect(restaurants.value).toEqual([LA_CEIBA]);
            expect(staleSince.value).toBeNull();
        });
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
