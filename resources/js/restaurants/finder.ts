import type { Lunch, Restaurant, RestaurantCategory } from './api';
import type { Filters } from './filterParams';
import { filtersFromUrl as readFilters, hasFilters } from './filterParams';
import { businessDay, openStatus } from './openStatus';

// Leer y escribir los filtros de la dirección también baja con la lista: el inicio los pide de aquí.
export { hasFilters, NO_FILTERS, sameAddress, writeFilters } from './filterParams';

/*
| Una dirección con búsqueda o filtros (`/?q=sancocho`: «Buscar dónde lo
| sirven», de la guía de platos, #21, o un enlace compartido) abre la lista
| una vez, cuando ya están los restaurantes: ahí están la búsqueda y la
| sección «Platos» (#17), que el mapa solo no muestra. Sin un parámetro
| aparte, para que los enlaces ya compartidos también la abran.
|
| Lo decide la bienvenida (WelcomeActions.vue), que se monta recién cuando
| hay restaurantes y baja con la lista: en el inicio solo queda escuchar su
| `list`, porque el arranque no tiene lugar (resources/js/map/bundle.test.ts).
| Se reconocen por ser el mismo objeto que leyó el inicio de su dirección: los
| que se cambian en la lista son otros, y al cerrarla no la vuelven a abrir.
*/
const listFromUrl = new WeakSet<Readonly<Filters>>();

/** Los filtros que pide una dirección (filterParams.ts); con alguno puesto, abren la lista una vez. */
export function filtersFromUrl(url: string): Filters {
    const filters = readFilters(url);

    if (hasFilters(filters)) {
        listFromUrl.add(filters);
    }

    return filters;
}

/** ¿Son los filtros que trajo la dirección y todavía no abrieron la lista? Responde que sí una sola vez. */
export function opensListFromUrl(filters: Readonly<Filters> | null): boolean {
    return filters !== null && listFromUrl.delete(filters);
}

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

/**
 * Sin tildes ni mayúsculas, con los espacios de más colapsados: «Comida
 * Típica» → «comida tipica». Además, lo que el teclado del celular cambia sin
 * avisar: los apóstrofos y comillas tipográficas (’ ‘ ʼ ` ´) cuentan como «'»
 * («Juan’s» encuentra a «Juan's»), los caracteres invisibles (U+200B a
 * U+200D, que deja pegar un texto) no cuentan, y NFKD lleva las formas de
 * compatibilidad (ligaduras, letras de ancho completo) a las comunes.
 */
export function normalizeText(text: string): string {
    return text
        .replace(/[\u2018\u2019\u02BC`\u00B4]/g, "'")
        .replace(/[\u200B-\u200D]/g, '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
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

/**
 * Los filtros sin la categoría si ninguno de `restaurants` la tiene (un enlace
 * viejo o mal armado: el selector no la ofrece y no se podría sacar), o null
 * si no hay nada que cambiar. Sin restaurantes todavía, null: no se sabe.
 */
export function withoutUnknownCategory(filters: Readonly<Filters>, restaurants: readonly Restaurant[]): Filters | null {
    const { category } = filters;

    if (category === null || restaurants.length === 0 || restaurants.some(({ categories }) => categories.some(({ slug }) => slug === category))) {
        return null;
    }

    return { ...filters, category: null };
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
 * `exclude` es el último sugerido: no se repite si hay otro abierto.
 */
export function pickSuggestion(
    restaurants: readonly Restaurant[],
    now: Date,
    random: () => number = Math.random,
    exclude: string | null = null,
): Restaurant | null {
    const allOpen = restaurants.filter((restaurant) => isOpenNow(restaurant, now));
    const others = allOpen.filter(({ slug }) => slug !== exclude);
    const open = others.length > 0 ? others : allOpen;

    if (open.length === 0) {
        return null;
    }

    const index = Math.min(open.length - 1, Math.max(0, Math.floor(random() * open.length)));

    return open[index] ?? null;
}
