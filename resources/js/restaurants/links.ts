/**
 * Las direcciones de un restaurante dentro de la app (ADR 0018). El frontend
 * no conoce las rutas de Laravel: repite el literal, y lo fija
 * tests/Feature/RestaurantPageTest.php.
 */

/** La ficha: GET /restaurants/{slug} (routes/web.php). El slug es el identificador público. */
export function restaurantUrl(slug: string): string {
    return `/restaurants/${encodeURIComponent(slug)}`;
}

/**
 * Parámetro de la dirección del inicio que dice qué restaurante abre elegido
 * en el mapa: `/?r=slug` (ADR 0016 y 0018). Solo lleva el restaurante: la
 * ubicación de quien usa el mapa nunca va en la URL (ADR 0008).
 */
export const SELECTED_PARAM = 'r';

/** El mapa del inicio con ese restaurante ya elegido: a donde lleva «Ver en el mapa». */
export function mapUrl(slug: string): string {
    return `/?${SELECTED_PARAM}=${encodeURIComponent(slug)}`;
}

/**
 * El restaurante que pide la dirección de una página (`page.url` de Inertia:
 * la ruta con sus parámetros), o null. Es un dato de quien armó el enlace: el
 * inicio solo lo usa para buscarlo en su lista.
 */
export function selectedFromUrl(url: string): string | null {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    const slug = new URLSearchParams(query).get(SELECTED_PARAM);

    return slug === null || slug === '' ? null : slug;
}
