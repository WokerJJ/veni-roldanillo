import type { Locale } from '@/composables/useI18n';

/**
 * La búsqueda por plato: GET /api/dishes/search (#17, ADR 0029). El navegador
 * le pregunta a este endpoint, nunca a Meilisearch. La forma de la respuesta
 * está en tests/contracts/dishes.search.json: DishSearchTest la compara con el
 * servidor y dishSearch.test.ts comprueba que este módulo la lee entera.
 *
 * Baja con la lista del inicio, fuera del arranque.
 */
export const DISH_SEARCH_ENDPOINT = '/api/dishes/search';

/** Letras que hacen falta antes de preguntar (el servidor pide 3 caracteres). */
export const DISH_SEARCH_MIN_LETTERS = 3;

/** El tope del servidor (DishSearchRequest::MAX_LENGTH). */
export const DISH_SEARCH_MAX_LENGTH = 60;

/** Plazo para que llegue la respuesta; pasado, se muestra el error. */
export const DISH_SEARCH_TIMEOUT_MS = 10_000;

export interface DishMatch {
    id: number;
    /** En el idioma pedido o, si el dueño no lo tradujo, en español. */
    name: string;
    description: string | null;
    /** La sección de la carta («Sopas»). */
    section: string | null;
    /** En pesos, entero. */
    price: number;
    /** En la carta y no «agotado hoy». */
    available: boolean;
}

export interface DishGroup {
    restaurant: { slug: string; name: string };
    dishes: DishMatch[];
}

/** Meilisearch no respondió (503): la búsqueda de restaurantes del dispositivo sigue andando. */
export class DishSearchUnavailable extends Error {
    constructor() {
        super('La búsqueda por plato no está disponible.');
        this.name = 'DishSearchUnavailable';
    }
}

/**
 * Lo que se le manda al servidor, o null si todavía no vale la pena
 * preguntar: los caracteres que el servidor no acepta pasan a ser espacios,
 * se colapsan los espacios y hacen falta al menos tres letras.
 */
export function dishQuery(text: string): string | null {
    const clean = text
        .replace(/[’‘ʼ]/gu, "'")
        .replace(/[^\p{L}\p{M}\p{N}' .-]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, DISH_SEARCH_MAX_LENGTH)
        .trim();

    return (clean.match(/\p{L}/gu)?.length ?? 0) >= DISH_SEARCH_MIN_LETTERS ? clean : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDish(value: unknown): DishMatch | null {
    if (!isRecord(value) || typeof value.id !== 'number' || typeof value.name !== 'string' || typeof value.price !== 'number' || !Number.isFinite(value.price)) {
        return null;
    }

    return {
        id: value.id,
        name: value.name,
        description: typeof value.description === 'string' ? value.description : null,
        section: typeof value.section === 'string' ? value.section : null,
        price: value.price,
        available: value.available !== false,
    };
}

function parseGroup(value: unknown): DishGroup | null {
    if (!isRecord(value) || !isRecord(value.restaurant) || !Array.isArray(value.dishes)) {
        return null;
    }

    const { slug, name } = value.restaurant;
    const dishes = value.dishes.map(parseDish).filter((dish) => dish !== null);

    return typeof slug === 'string' && typeof name === 'string' && dishes.length > 0 ? { restaurant: { slug, name }, dishes } : null;
}

/** Los grupos de la respuesta; uno sin lo mínimo se descarta. */
export function parseDishResults(body: unknown): DishGroup[] {
    if (!isRecord(body) || !Array.isArray(body.results)) {
        throw new Error('Platos: la respuesta no trae resultados.');
    }

    return body.results.map(parseGroup).filter((group) => group !== null);
}

/**
 * Pregunta por `query` (ya pasada por dishQuery) en `locale`. Sin cookies: es
 * pública, y cada URL es una respuesta que el navegador guarda un minuto. Se
 * rechaza con DishSearchUnavailable si el servidor dice 503, y con un error
 * cualquiera si se aborta `signal`, pasa el plazo o la respuesta no sirve.
 */
export async function fetchDishes(query: string, locale: Locale, signal: AbortSignal): Promise<DishGroup[]> {
    // Como fetchRestaurants (api.ts): sin AbortSignal.any, que los celulares
    // de hace unos años no tienen.
    const timeout = new AbortController();
    const abort = (): void => {
        timeout.abort(signal.reason);
    };
    const timer = setTimeout(() => {
        timeout.abort(new DOMException(`Los platos no llegaron en ${String(DISH_SEARCH_TIMEOUT_MS / 1000)} s.`, 'TimeoutError'));
    }, DISH_SEARCH_TIMEOUT_MS);

    signal.addEventListener('abort', abort, { once: true });

    try {
        signal.throwIfAborted();

        const params = new URLSearchParams({ q: query, lang: locale });
        const response = await fetch(`${DISH_SEARCH_ENDPOINT}?${params.toString()}`, {
            signal: timeout.signal,
            headers: { Accept: 'application/json' },
            credentials: 'omit',
        });

        if (response.status === 503) {
            throw new DishSearchUnavailable();
        }

        if (!response.ok) {
            throw new Error(`Platos: HTTP ${String(response.status)}`);
        }

        return parseDishResults(await response.json());
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
}

/** Los grupos de los restaurantes en `allowed` (los que cumplen los demás filtros); null: todos. */
export function withinFilters(groups: readonly DishGroup[], allowed: ReadonlySet<string> | null): DishGroup[] {
    return allowed === null ? [...groups] : groups.filter(({ restaurant }) => allowed.has(restaurant.slug));
}
