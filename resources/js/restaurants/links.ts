/**
 * Las direcciones de un restaurante dentro de la app (ADR 0018). El frontend
 * no conoce las rutas de Laravel: repite el literal, y lo fija
 * tests/Feature/RestaurantPageTest.php.
 */

/** La ficha: GET /restaurants/{slug} (routes/web.php). El slug es el identificador público. */
export function restaurantUrl(slug: string): string {
    return `/restaurants/${encodeURIComponent(slug)}`;
}
