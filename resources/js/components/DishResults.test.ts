import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DISH_SEARCH_DEBOUNCE_MS } from '@/restaurants/useDishSearch';
import type * as FakeInertia from '@/testing/inertia';

import contract from '../../../tests/contracts/dishes.search.json';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

interface Pending {
    url: string;
    signal: AbortSignal | undefined;
    respond: (status: number, body?: unknown) => void;
    fail: () => void;
}

/** fetch de mentira para la búsqueda por plato: la prueba decide cuándo y con qué llega cada pedido. */
function stubDishFetch() {
    const requests: Pending[] = [];

    vi.stubGlobal(
        'fetch',
        vi.fn(
            (url: string, init?: RequestInit) =>
                new Promise((resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('La petición se canceló.', 'AbortError'));
                    });
                    requests.push({
                        url,
                        signal: init?.signal ?? undefined,
                        respond: (status, body = {}) => {
                            resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
                        },
                        fail: () => {
                            reject(new TypeError('Failed to fetch'));
                        },
                    });
                }),
        ),
    );

    return requests;
}

async function mountResults(query: string, allowed: ReadonlySet<string> | null = null) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: DishResults } = await import('./DishResults.vue');

    return mount(DishResults, { props: { query, allowed } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('DishResults', () => {
    it('con menos de tres letras no muestra nada ni pregunta', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sa');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS * 2);

        expect(wrapper.find('[data-dishes]').exists()).toBe(false);
        expect(requests).toHaveLength(0);
    });

    it('espera a que se deje de teclear, cancela la petición vieja y muestra la última, agrupada', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('san');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        expect(requests).toHaveLength(1);

        await wrapper.setProps({ query: 'sanc' });
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS - 1);
        await wrapper.setProps({ query: 'sancocho' });
        expect(requests[0]?.signal?.aborted).toBe(true);
        expect(wrapper.find('[data-dishes-loading]').exists()).toBe(true);

        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        // La de «sanc» nunca salió: la pausa no llegó a pasar.
        expect(requests.map(({ url }) => new URL(url, 'http://x').searchParams.get('q'))).toEqual(['san', 'sancocho']);

        requests[1]?.respond(200, contract);
        await flushPromises();

        expect(wrapper.find('[data-dish-restaurant="prueba-la-ceiba"]').text()).toContain('Restaurante de Prueba La Ceiba');
        expect(wrapper.findAll('[data-dish]').map((dish) => dish.attributes('href'))).toEqual(['/restaurants/prueba-la-ceiba', '/restaurants/prueba-la-ceiba']);
        expect(wrapper.findAll('[data-dish]')[1]?.text()).toContain('No disponible hoy');
        expect(wrapper.find('[data-dishes-status]').text()).toBe('Platos que coinciden: 2');
    });

    it('mientras carga, la región de estado no dice nada', async () => {
        stubDishFetch();
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);

        expect(wrapper.find('[data-dishes-status]').text()).toBe('');
    });

    it('elegir el restaurante lo emite para el mapa', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.respond(200, contract);
        await flushPromises();

        await wrapper.find('[data-dish-restaurant]').trigger('click');

        expect(wrapper.emitted('select')).toEqual([['prueba-la-ceiba']]);
    });

    it('sin resultados en los restaurantes filtrados, lo dice', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho', new Set(['otro']));
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.respond(200, contract);
        await flushPromises();

        expect(wrapper.find('[data-dishes-message]').text()).toBe('No encontramos «sancocho» entre los restaurantes con estos filtros.');
        expect(wrapper.find('[data-dishes-results]').exists()).toBe(false);

        const clear = wrapper.get('button[data-dishes-clear-filters]');
        expect(clear.text()).toBe('Ver sin filtros');
        await clear.trigger('click');
        expect(wrapper.emitted('clearFilters')).toEqual([[]]);
    });

    it('sin ningún plato, no ofrece quitar filtros', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho', new Set(['otro']));
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.respond(200, { results: [] });
        await flushPromises();

        expect(wrapper.find('[data-dishes-message]').text()).toBe('Ningún plato con «sancocho».');
        expect(wrapper.find('[data-dishes-clear-filters]').exists()).toBe(false);
    });

    it('el botón de reintentar no queda escondido para el lector de pantalla', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.fail();
        await flushPromises();

        const retry = wrapper.get('[data-dishes-retry]').element;
        expect(retry.closest('[aria-hidden="true"]')).toBeNull();
        expect(wrapper.get('[data-dishes-message]').attributes('aria-hidden')).toBe('true');
    });

    it('pasado el límite de búsquedas (429) dice que no está disponible, no que falta señal', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.respond(429, { message: 'Too Many Attempts.' });
        await flushPromises();

        expect(wrapper.find('[data-dishes-status]').text()).toContain('no está disponible');
        expect(wrapper.find('[data-dishes-retry]').exists()).toBe(false);
    });

    it('sin señal espera: al volver la conexión, busca solo', async () => {
        const requests = stubDishFetch();
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        expect(requests).toHaveLength(0);

        online.mockReturnValue(true);
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);

        expect(requests).toHaveLength(1);
        requests[0]?.respond(200, contract);
        await flushPromises();
        expect(wrapper.find('[data-dishes-status]').text()).toBe('Platos que coinciden: 2');
    });

    it('si la búsqueda de platos no está (503), lo dice sin botón; si falla la red, ofrece reintentar', async () => {
        const requests = stubDishFetch();
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[0]?.respond(503, { error: 'search_unavailable' });
        await flushPromises();

        expect(wrapper.find('[data-dishes-status]').text()).toContain('no está disponible');
        expect(wrapper.find('[data-dishes-retry]').exists()).toBe(false);

        await wrapper.setProps({ query: 'ajiaco' });
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);
        requests[1]?.fail();
        await flushPromises();

        expect(wrapper.find('[data-dishes-status]').text()).toContain('No pudimos buscar platos');
        await wrapper.find('[data-dishes-retry]').trigger('click');
        await vi.advanceTimersByTimeAsync(0);
        expect(requests).toHaveLength(3);
    });

    it('sin señal no pregunta', async () => {
        const requests = stubDishFetch();
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const wrapper = await mountResults('sancocho');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_DEBOUNCE_MS);

        expect(requests).toHaveLength(0);
        expect(wrapper.find('[data-dishes-status]').text()).toContain('Sin señal');
    });
});
