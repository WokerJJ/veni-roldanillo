import { afterEach, describe, expect, it, vi } from 'vitest';

import { EL_GUADUAL, feature, LA_CEIBA, stubRestaurantsFetch } from '@/testing/restaurants';

// Una respuesta de ejemplo del servidor: tests/Feature/Api/RestaurantsGeoJsonTest.php la compara con la de verdad.
import contract from '../../../tests/contracts/restaurants.geojson.json';
import { fetchRestaurants, RESTAURANTS_ENDPOINT, RESTAURANTS_TIMEOUT_MS } from './api';

afterEach(() => {
    vi.useRealTimers();
});

describe('pedir los restaurantes del mapa', () => {
    it.each(['es', 'en'] as const)('los pide con el idioma en la URL (%s), y nada más', async (locale) => {
        const network = stubRestaurantsFetch([LA_CEIBA]);

        await fetchRestaurants(locale, new AbortController().signal);

        // El idioma es lo único que viaja: ni posición, ni quién pide.
        expect(network.urls()).toEqual([`${RESTAURANTS_ENDPOINT}?lang=${locale}`]);
        expect(network.fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Accept: 'application/geo+json, application/json' });
        // Sin cookies: la sesión no acompaña a un pedido público.
        expect(network.fetchMock.mock.calls[0]?.[1]?.credentials).toBe('omit');
    });

    it('devuelve cada figura como un restaurante, con el punto como [longitud, latitud]', async () => {
        stubRestaurantsFetch([LA_CEIBA, EL_GUADUAL]);

        const restaurants = await fetchRestaurants('es', new AbortController().signal);

        expect(restaurants).toEqual([LA_CEIBA, EL_GUADUAL]);
        expect(restaurants[0]?.coordinates).toEqual([-76.1547, 4.4128]);
    });

    it('lee el contrato del servidor sin perder nada', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.respondWith({ status: 200, body: contract });

        // Cada figura vuelve entera: sus propiedades y su punto. Un campo que el
        // servidor sume o renombre y este módulo no lea, aquí falta.
        await expect(pending).resolves.toEqual(contract.features.map(({ geometry, properties }) => ({ ...properties, coordinates: geometry.coordinates })));
    });

    it('sin restaurantes devuelve una lista vacía', async () => {
        stubRestaurantsFetch([]);

        await expect(fetchRestaurants('es', new AbortController().signal)).resolves.toEqual([]);
    });

    it('se queda solo con lo que conoce de cada figura', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.respondWith({
            status: 200,
            body: {
                type: 'FeatureCollection',
                features: [{ ...feature(LA_CEIBA), properties: { ...feature(LA_CEIBA).properties, whatsapp: '570000000000', owner: 'alguien' } }],
            },
        });

        const [restaurant] = await pending;

        expect(restaurant).toEqual(LA_CEIBA);
        expect(Object.keys(restaurant ?? {}).sort()).toEqual(['categories', 'coordinates', 'delivery', 'fictitious', 'hours', 'name', 'slug', 'special_hours']);
    });

    it('descarta la figura que no trae punto, slug o nombre, y deja pasar las demás', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);
        const good = feature(LA_CEIBA);

        network.last()?.respondWith({
            status: 200,
            body: {
                type: 'FeatureCollection',
                features: [
                    null,
                    { ...good, geometry: { type: 'LineString', coordinates: [] } },
                    { ...good, geometry: { type: 'Point', coordinates: ['-76.15', null] } },
                    { ...good, properties: { ...good.properties, slug: undefined } },
                    { ...good, properties: { ...good.properties, name: 42 } },
                    good,
                ],
            },
        });

        await expect(pending).resolves.toEqual([LA_CEIBA]);
    });

    it('lo que falte o venga mal en una figura queda en su valor sin datos', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.respondWith({
            status: 200,
            body: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [-76.15, 4.41] },
                        properties: {
                            slug: 'incompleto',
                            name: 'Incompleto (ficticio)',
                            categories: [{ slug: 'asados' }, 'asados', { slug: 'asados', name: 'Asados' }],
                            delivery: 'sí',
                            hours: [{ weekday: '1', opens: '11:00', closes: '15:00' }, { weekday: 1, opens: '11:00', closes: '15:00' }],
                            special_hours: [{ date: '2026-10-07', closed: true }, { closed: true }],
                        },
                    },
                ],
            },
        });

        await expect(pending).resolves.toEqual([
            {
                slug: 'incompleto',
                name: 'Incompleto (ficticio)',
                coordinates: [-76.15, 4.41],
                categories: [{ slug: 'asados', name: 'Asados' }],
                delivery: false,
                fictitious: false,
                hours: [{ weekday: 1, opens: '11:00', closes: '15:00' }],
                special_hours: [{ date: '2026-10-07', closed: true, opens: null, closes: null }],
            },
        ]);
    });

    it.each([429, 500, 503])('con un %i falla: quien pide muestra el error', async (status) => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.respondWith({ status, body: { message: 'Too Many Attempts.' } });

        await expect(pending).rejects.toThrow(`HTTP ${String(status)}`);
    });

    it('si la respuesta no es una FeatureCollection, falla', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.respondWith({ status: 200, body: { data: [] } });

        await expect(pending).rejects.toThrow('FeatureCollection');
    });

    it('sin señal, falla con el error de la red', async () => {
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);

        network.last()?.fail();

        await expect(pending).rejects.toThrow('Failed to fetch');
    });

    it('al abortar, cancela el pedido', async () => {
        const network = stubRestaurantsFetch();
        const controller = new AbortController();
        const pending = fetchRestaurants('es', controller.signal);

        controller.abort();

        await expect(pending).rejects.toThrow();
        expect(network.last()?.signal?.aborted).toBe(true);
    });

    it('con la señal ya abortada no sale a la red', async () => {
        const network = stubRestaurantsFetch();
        const controller = new AbortController();
        controller.abort();

        await expect(fetchRestaurants('es', controller.signal)).rejects.toThrow();
        expect(network.requests).toHaveLength(0);
    });

    it('si la red se cuelga, a los 20 segundos se rinde', async () => {
        vi.useFakeTimers();
        const network = stubRestaurantsFetch();
        const pending = fetchRestaurants('es', new AbortController().signal);
        const outcome = pending.catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(RESTAURANTS_TIMEOUT_MS - 1);
        expect(network.last()?.signal?.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(RESTAURANTS_TIMEOUT_MS).toBe(20_000);
        expect(network.last()?.signal?.aborted).toBe(true);
        expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    });

    it('cuando llega la respuesta, el plazo no queda corriendo', async () => {
        vi.useFakeTimers();
        stubRestaurantsFetch([LA_CEIBA]);

        await fetchRestaurants('es', new AbortController().signal);

        expect(vi.getTimerCount()).toBe(0);
    });
});
