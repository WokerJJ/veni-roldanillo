import type { Lunch, Restaurant, RestaurantCategory } from './api';
import type { Filters } from './filterParams';
import { businessDay, openStatus } from './openStatus';

// Leer y escribir los filtros de la dirección también baja con la lista: el inicio los pide de aquí.
export { filtersFromUrl, hasFilters, NO_FILTERS, writeFilters } from './filterParams';

/*
| Búsqueda, filtros, «Almuerzos de hoy» y «Sugiéreme algo» del inicio (#12),
| en el dispositivo y sobre los restaurantes que ya trajo el mapa (ADR 0028):
| un municipio tiene pocos, y así no sale ningún pedido por cada letra. La
| búsqueda por plato, con Meilisearch, es otra cosa (#17).
|
| Funciones puras: la hora y el azar entran como parámetros, para que las
| pruebas sean deterministas. Baja con la lista, fuera del arranque: necesita
| openStatus.ts (ADR 0022).
*/

/** Sin tildes ni mayúsculas, con los espacios de más colapsados: «Comida Típica» → «comida tipica». */
export function normalizeText(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * ¿El restaurante responde a lo que se escribió? Cada palabra tiene que
 * aparecer en el nombre o en alguna categoría (en cualquier orden): «tipica
 * ceiba» encuentra a La Ceiba si es de comida típica. Vacío: todos.
 */
export function matchesQuery(restaurant: Restaurant, query: string): boolean {
    const words = normalizeText(query).split(' ').filter((word) => word !== '');

    if (words.length === 0) {
        return true;
    }

    const haystack = normalizeText([restaurant.name, ...restaurant.categories.map(({ name }) => name)].join(' '));

    return words.every((word) => haystack.includes(word));
}

/** ¿Está abierto en `now`? Con la misma lógica que el resumen y la lista (ADR 0017). */
export function isOpenNow(restaurant: Restaurant, now: Date): boolean {
    return openStatus(restaurant, now).state === 'open';
}

/**
 * Los restaurantes que cumplen todos los filtros, en el orden en que
 * llegaron. «Abierto ahora» deja fuera a los que no tienen horario cargado
 * (no se sabe si abren); un precio, a los que no lo cargaron.
 */
export function filterRestaurants(restaurants: readonly Restaurant[], filters: Readonly<Filters>, now: Date): Restaurant[] {
    return restaurants.filter(
        (restaurant) =>
            (!filters.delivery || restaurant.delivery) &&
            (filters.price === null || (restaurant.price_level !== null && restaurant.price_level <= filters.price)) &&
            (filters.category === null || restaurant.categories.some(({ slug }) => slug === filters.category)) &&
            matchesQuery(restaurant, filters.query) &&
            (!filters.open || isOpenNow(restaurant, now)),
    );
}

/** Las categorías de esos restaurantes, sin repetir, por nombre (con las reglas del idioma). */
export function categoriesOf(restaurants: readonly Restaurant[], locale: string): RestaurantCategory[] {
    const bySlug = new Map<string, RestaurantCategory>();

    for (const category of restaurants.flatMap(({ categories }) => categories)) {
        if (!bySlug.has(category.slug)) {
            bySlug.set(category.slug, category);
        }
    }

    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface LunchOfTheDay {
    restaurant: Restaurant;
    lunch: Lunch;
}

/**
 * Los almuerzos de hoy en Colombia, del más barato al más caro (y, si
 * empatan, en el orden de la lista). Uno de otra fecha no sale: la lista
 * puede ser de ayer si la app quedó abierta pasada la medianoche.
 */
export function todaysLunches(restaurants: readonly Restaurant[], now: Date): LunchOfTheDay[] {
    const today = businessDay(now).date;

    return restaurants
        .filter((restaurant): restaurant is Restaurant & { lunch: Lunch } => restaurant.lunch?.date === today)
        .map((restaurant) => ({ restaurant, lunch: restaurant.lunch }))
        .sort((a, b) => a.lunch.price - b.lunch.price);
}

/**
 * Uno al azar entre los que están abiertos ahora, o null si no hay ninguno.
 * `random` es como Math.random (un número en [0, 1)): las pruebas pasan uno fijo.
 */
export function pickSuggestion(restaurants: readonly Restaurant[], now: Date, random: () => number = Math.random): Restaurant | null {
    const open = restaurants.filter((restaurant) => isOpenNow(restaurant, now));

    if (open.length === 0) {
        return null;
    }

    const index = Math.min(open.length - 1, Math.max(0, Math.floor(random() * open.length)));

    return open[index] ?? null;
}
