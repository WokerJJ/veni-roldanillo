import type { Filters } from '@/restaurants/filterParams';

/**
 * Los filtros puestos además del buscador: se cuentan en el rótulo de
 * «Filtros». Aparte de filterParams.ts, que viaja en el arranque: esto solo lo
 * usan el buscador y la lista, que bajan después.
 */
export function activeFilterCount(filters: Readonly<Filters>): number {
    return [filters.open, filters.delivery, filters.price !== null, filters.category !== null].filter(Boolean).length;
}
