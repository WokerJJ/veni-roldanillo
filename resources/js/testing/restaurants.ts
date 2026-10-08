/**
 * Restaurantes de mentira para Vitest y la red que los sirve: lo que responde
 * GET /api/restaurants.geojson (App\Http\Resources\RestaurantFeature), sin
 * servidor. Todos son ficticios, como los datos de ejemplo de la app.
 */
import { vi } from 'vitest';

import type { Restaurant } from '@/restaurants/api';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Un restaurante que abre todos los días de 11:00 a 15:00. */
export function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
    return {
        slug: 'prueba-la-ceiba',
        name: 'Restaurante de Prueba La Ceiba (ficticio)',
        coordinates: [-76.1547, 4.4128],
        categories: [{ slug: 'comida-tipica', name: 'Comida típica' }],
        delivery: true,
        fictitious: true,
        hours: EVERY_DAY.map((weekday) => ({ weekday, opens: '11:00', closes: '15:00' })),
        special_hours: [],
        ...overrides,
    };
}

export const LA_CEIBA = restaurant();

export const EL_GUADUAL = restaurant({
    slug: 'prueba-el-guadual',
    name: 'Restaurante de Prueba El Guadual (ficticio)',
    coordinates: [-76.1539, 4.4102],
    categories: [
        { slug: 'asados', name: 'Asados' },
        { slug: 'comidas-rapidas', name: 'Comidas rápidas' },
    ],
    delivery: false,
    hours: EVERY_DAY.map((weekday) => ({ weekday, opens: '18:00', closes: '02:00' })),
});

/** Un restaurante como figura de la respuesta del servidor. */
export function feature({ coordinates, ...properties }: Restaurant) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties };
}

/** El cuerpo de la respuesta: una FeatureCollection con esos restaurantes. */
export function featureCollection(restaurants: readonly Restaurant[]) {
    return { type: 'FeatureCollection', features: restaurants.map(feature) };
}

interface PendingRequest {
    url: string;
    signal: AbortSignal | undefined;
    /** Responde con esos restaurantes (200). */
    respond: (restaurants: readonly Restaurant[]) => void;
    /** Responde con un estado de error o con un cuerpo que no es lo esperado. */
    respondWith: (response: { status: number; body?: unknown }) => void;
    /** La red falla: como sin señal. */
    fail: () => void;
}

/**
 * fetch de mentira. Los pedidos de restaurantes quedan en `requests` para que
 * la prueba decida cuándo y con qué llegan (o `answer` los responde enseguida);
 * cualquier otro pedido (el estilo del mapa) no llega nunca. Como el de
 * verdad, rechaza al abortar la señal.
 */
export function stubRestaurantsFetch(answer?: readonly Restaurant[]) {
    const requests: PendingRequest[] = [];

    const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal; headers?: Record<string, string>; credentials?: RequestCredentials }) => {
        if (!url.startsWith('/api/restaurants.geojson')) {
            return new Promise<never>(() => undefined);
        }

        return new Promise((resolve, reject) => {
            const respondWith: PendingRequest['respondWith'] = ({ status, body }) => {
                resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
            };
            const respond: PendingRequest['respond'] = (restaurants) => {
                respondWith({ status: 200, body: featureCollection(restaurants) });
            };

            init?.signal?.addEventListener('abort', () => {
                reject(init.signal?.reason instanceof Error ? init.signal.reason : new DOMException('La petición se canceló.', 'AbortError'));
            });

            requests.push({
                url,
                signal: init?.signal,
                respond,
                respondWith,
                fail: () => {
                    reject(new TypeError('Failed to fetch'));
                },
            });

            if (answer) {
                respond(answer);
            }
        });
    });

    vi.stubGlobal('fetch', fetchMock);

    return {
        fetchMock,
        requests,
        /** Las URL de los pedidos de restaurantes, en orden. */
        urls: () => requests.map((request) => request.url),
        last: () => requests.at(-1),
    };
}
