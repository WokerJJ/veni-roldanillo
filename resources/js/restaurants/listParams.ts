/**
 * ¿La dirección trae una búsqueda o filtros (`/?q=sancocho`, desde la guía de
 * platos)? Entonces el inicio abre la lista enseguida, con sus siluetas hasta
 * que lleguen los restaurantes y la lista (#138, ADR 0040).
 *
 * Viaja con el arranque: por eso no importa nada y no usa filterParams.ts,
 * que baja con la lista. Lee la dirección igual que `filtersFromUrl` y
 * `hasFilters` (el primer valor de cada parámetro, ya decodificado, con los
 * mismos topes y el mismo formato de categoría): filterParams.test.ts
 * comprueba que digan lo mismo, y un valor que la lista ignora (`price=2`,
 * `open=10`, `q=+`) tampoco la abre aquí.
 */
export function hasListParams(url: string): boolean {
    const at = url.indexOf('?');
    const params = new URLSearchParams(at < 0 ? '' : url.slice(at + 1).split('#')[0]);
    const category = params.get('category') ?? '';

    return (
        (params.get('q') ?? '').slice(0, 80).trim() !== '' ||
        params.get('open') === '1' ||
        params.get('delivery') === '1' ||
        [15_000, 25_000, 40_000].includes(Number(params.get('price'))) ||
        (category.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category))
    );
}
