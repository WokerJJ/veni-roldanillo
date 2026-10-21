/**
 * A cuántos metros queda cada restaurante de la ubicación de quien usa el
 * mapa (#81), para la lista. Se calcula en el dispositivo, en línea recta: la
 * ubicación no sale de aquí (ADR 0008 y 0022).
 */

/** Radio medio de la Tierra, en metros. */
const EARTH_RADIUS = 6_371_008.8;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Metros en línea recta entre dos puntos `[longitud, latitud]` (haversine). */
export function metersBetween([lng1, lat1]: readonly [number, number], [lng2, lat2]: readonly [number, number]): number {
    const dLat = radians(lat2 - lat1);
    const dLng = radians(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * La distancia hasta cada restaurante, por slug, redondeada a 10 m: lo que
 * la lista muestra, sin la precisión de la ubicación de donde salió.
 */
export function distancesFrom(here: readonly [number, number], restaurants: readonly { slug: string; coordinates: [number, number] }[]): Record<string, number> {
    return Object.fromEntries(restaurants.map(({ slug, coordinates }) => [slug, Math.round(metersBetween(here, coordinates) / 10) * 10]));
}
