import type { Locale } from '@/composables/useI18n';

import type { Schedule, SpecialHours, WeeklyHours } from './openStatus';

/**
 * Los restaurantes del mapa: GET /api/restaurants.geojson (routes/api.php,
 * App\Http\Resources\RestaurantFeature). El servidor usa el mismo literal: lo
 * fija tests/Feature/Api/RestaurantsGeoJsonTest.php.
 */
export const RESTAURANTS_ENDPOINT = '/api/restaurants.geojson';

/** Plazo para que llegue la lista; pasado, se muestra el error con «Reintentar». */
export const RESTAURANTS_TIMEOUT_MS = 20_000;

export interface RestaurantCategory {
    slug: string;
    name: string;
}

/** Un restaurante como lo necesita el mapa: lo público y nada más (ADR 0017). */
export interface Restaurant extends Schedule {
    /** Identificador público; el de la URL de la ficha. */
    slug: string;
    name: string;
    /** `[longitud, latitud]`. */
    coordinates: [number, number];
    /** En el idioma con que se pidió la lista. */
    categories: RestaurantCategory[];
    delivery: boolean;
    /** Dato de ejemplo: la interfaz lo marca «Datos de ejemplo». */
    fictitious: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listOf<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
    return Array.isArray(value) ? value.map(parse).filter((item) => item !== null) : [];
}

function parseCategory(value: unknown): RestaurantCategory | null {
    return isRecord(value) && typeof value.slug === 'string' && typeof value.name === 'string' ? { slug: value.slug, name: value.name } : null;
}

function parseHours(value: unknown): WeeklyHours | null {
    return isRecord(value) && typeof value.weekday === 'number' && typeof value.opens === 'string' && typeof value.closes === 'string'
        ? { weekday: value.weekday, opens: value.opens, closes: value.closes }
        : null;
}

function parseSpecialHours(value: unknown): SpecialHours | null {
    if (!isRecord(value) || typeof value.date !== 'string') {
        return null;
    }

    return {
        date: value.date,
        closed: value.closed === true,
        opens: typeof value.opens === 'string' ? value.opens : null,
        closes: typeof value.closes === 'string' ? value.closes : null,
    };
}

/** Una figura de la respuesta; la que no trae lo mínimo (punto, slug y nombre) se descarta. */
function parseFeature(value: unknown): Restaurant | null {
    if (!isRecord(value) || !isRecord(value.geometry) || !isRecord(value.properties)) {
        return null;
    }

    const { coordinates } = value.geometry;
    const properties = value.properties;

    if (
        value.geometry.type !== 'Point' ||
        !Array.isArray(coordinates) ||
        !Number.isFinite(coordinates[0]) ||
        !Number.isFinite(coordinates[1]) ||
        typeof properties.slug !== 'string' ||
        typeof properties.name !== 'string'
    ) {
        return null;
    }

    return {
        slug: properties.slug,
        name: properties.name,
        coordinates: [coordinates[0] as number, coordinates[1] as number],
        categories: listOf(properties.categories, parseCategory),
        delivery: properties.delivery === true,
        fictitious: properties.fictitious === true,
        hours: listOf(properties.hours, parseHours),
        special_hours: listOf(properties.special_hours, parseSpecialHours),
    };
}

/**
 * Pide los restaurantes publicados, con las categorías en `locale`. El idioma
 * va en la URL: es lo único que viaja (el pedido sale sin cookies), y cada URL
 * es una sola respuesta que el navegador guarda un minuto. Se rechaza si la
 * respuesta no es un 200 con una FeatureCollection, si se aborta `signal` o si
 * pasa el plazo.
 */
export async function fetchRestaurants(locale: Locale, signal: AbortSignal): Promise<Restaurant[]> {
    const timeout = new AbortController();
    const abort = (): void => {
        timeout.abort(signal.reason);
    };
    const timer = setTimeout(() => {
        timeout.abort(new DOMException(`Los restaurantes no llegaron en ${String(RESTAURANTS_TIMEOUT_MS / 1000)} s.`, 'TimeoutError'));
    }, RESTAURANTS_TIMEOUT_MS);

    signal.addEventListener('abort', abort, { once: true });

    try {
        signal.throwIfAborted();

        const response = await fetch(`${RESTAURANTS_ENDPOINT}?lang=${locale}`, {
            signal: timeout.signal,
            headers: { Accept: 'application/geo+json, application/json' },
            // Sin cookies: la lista es pública y el servidor no mira quién la pide.
            credentials: 'omit',
        });

        if (!response.ok) {
            throw new Error(`Restaurantes: HTTP ${String(response.status)}`);
        }

        const body: unknown = await response.json();

        if (!isRecord(body) || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
            throw new Error('Restaurantes: la respuesta no es una FeatureCollection.');
        }

        return listOf(body.features, parseFeature);
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
}
