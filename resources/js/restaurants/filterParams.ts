/**
 * Los filtros del inicio (#12) y cómo viajan en la dirección, igual que el
 * restaurante elegido (`?r=slug`): así «atrás» desde una ficha vuelve a la
 * misma búsqueda, y un enlace la comparte. Solo lo que se eligió en la
 * pantalla: nunca la ubicación de quien usa el mapa (ADR 0008 y 0028).
 *
 * Este módulo baja con la lista (finder.ts lo reexporta); el inicio solo usa
 * sus tipos. No importa nada.
 */

export interface Filters {
    /** Lo que se escribió en el buscador, tal cual (se normaliza al comparar). */
    query: string;
    /** Solo los abiertos ahora (calculado en el dispositivo, ADR 0017). */
    open: boolean;
    /** Solo los que hacen domicilios. */
    delivery: boolean;
    /** Hasta ese nivel de precio (1 = $ … 4 = $$$$), o cualquiera. */
    price: number | null;
    /** El slug de una categoría, o cualquiera. */
    category: string | null;
}

export const NO_FILTERS: Readonly<Filters> = { query: '', open: false, delivery: false, price: null, category: null };

/** Los parámetros de la dirección, uno por filtro. `r` es el del elegido (links.ts). */
export const FILTER_PARAMS = { query: 'q', open: 'open', delivery: 'delivery', price: 'price', category: 'category' } as const;

/** Lo más largo que se acepta en el buscador: un nombre de restaurante entra de sobra. */
export const MAX_QUERY_LENGTH = 80;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ¿Hay algún filtro puesto? El buscador con solo espacios no cuenta. */
export function hasFilters(filters: Readonly<Filters>): boolean {
    return filters.query.trim() !== '' || filters.open || filters.delivery || filters.price !== null || filters.category !== null;
}

/**
 * Los filtros que pide una dirección (`page.url` de Inertia). Lo que no se
 * entiende se ignora: es un dato de quien armó el enlace.
 */
export function filtersFromUrl(url: string): Filters {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    const params = new URLSearchParams(query);
    const price = Number(params.get(FILTER_PARAMS.price));
    const category = params.get(FILTER_PARAMS.category);

    return {
        query: (params.get(FILTER_PARAMS.query) ?? '').slice(0, MAX_QUERY_LENGTH),
        open: params.get(FILTER_PARAMS.open) === '1',
        delivery: params.get(FILTER_PARAMS.delivery) === '1',
        price: Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
        category: category !== null && category.length <= 100 && SLUG.test(category) ? category : null,
    };
}

/** Escribe los filtros en `params`: los que no están puestos salen de la dirección. */
export function writeFilters(params: URLSearchParams, filters: Readonly<Filters>): void {
    const values: Record<keyof Filters, string | null> = {
        query: filters.query.trim() === '' ? null : filters.query.slice(0, MAX_QUERY_LENGTH),
        open: filters.open ? '1' : null,
        delivery: filters.delivery ? '1' : null,
        price: filters.price === null ? null : String(filters.price),
        category: filters.category,
    };

    for (const [key, name] of Object.entries(FILTER_PARAMS) as [keyof Filters, string][]) {
        const value = values[key];

        if (value === null) {
            params.delete(name);
        } else {
            params.set(name, value);
        }
    }
}

/**
 * ¿Las dos direcciones son la misma? Con los parámetros normalizados, no el
 * texto: «?q=la%20ceiba» y «?q=la+ceiba» son la misma búsqueda, y volver a
 * escribirla sumaría una visita para nada.
 */
export function sameAddress(a: string, b: string): boolean {
    const normalized = (url: string): string => {
        const { pathname, searchParams, hash } = new URL(url, 'https://veni.invalid');
        searchParams.sort();

        return `${pathname}?${searchParams.toString()}${hash}`;
    };

    return normalized(a) === normalized(b);
}
