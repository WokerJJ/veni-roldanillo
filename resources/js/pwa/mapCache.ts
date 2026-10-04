/*
| Lo que el service worker guarda del host del mapa (#5). Lo usa
| vite.config.ts al compilar: el patrón queda escrito en public/sw.js.
*/

/** Origen (esquema, host y puerto) de una URL http o https; si no, null. */
function originOf(url: string | undefined): string | null {
    if (url === undefined || url.trim() === '') {
        return null;
    }

    try {
        const parsed = new URL(url.trim());

        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
    } catch {
        return null;
    }
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Estilos, glyphs y sprites de veni-mapa: los archivos `.json`, `.pbf`,
 * `.png` y `.webp` del origen de `VITE_MAP_STYLE_URL`, que también sirve el
 * resto del mapa (ADR 0014: el mapa comparte un solo origen).
 *
 * Quedan fuera el PMTiles, que se pide por rangos (`Range`) y la Cache API no
 * guarda respuestas parciales (docs/03-arquitectura.md), y el grafo de rutas
 * (`VITE_MAP_ROUTES_URL`, más de 500 kB), que solo se pide al calcular una
 * ruta. Sin URL del estilo, no hay patrón: el mapa no carga y no hay nada que
 * guardar.
 */
export function mapCachePattern(styleUrl: string | undefined, routesUrl?: string): RegExp | null {
    const origin = originOf(styleUrl);

    if (origin === null) {
        return null;
    }

    const routes = originOf(routesUrl) === origin && routesUrl !== undefined ? new URL(routesUrl.trim()).pathname : null;
    // El grafo de rutas también es .json: se descarta antes de mirar la extensión.
    const withoutRoutes = routes === null ? '' : `(?!${escapeRegExp(routes.slice(1))}(?:[?#]|$))`;

    return new RegExp(`^${escapeRegExp(origin)}/${withoutRoutes}[^?#]*\\.(?:json|pbf|png|webp)(?:[?#].*)?$`);
}
