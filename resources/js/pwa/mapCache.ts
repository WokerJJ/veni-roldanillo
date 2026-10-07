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

const MAP_FILES = ['json', 'pbf', 'png', 'webp'] as const;

/** Carpeta de una versión publicada de veni-mapa: /v0.2.0/. */
const VERSION_FOLDER = '\\/v\\d+\\.\\d+\\.\\d+\\/';

export interface MapCacheFilter {
    /** Solo lo que lleva la versión en la ruta (true) o solo lo que no (false). */
    versioned?: boolean;
    files?: readonly (typeof MAP_FILES)[number][];
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
 *
 * Con `only` el patrón se queda con una parte: los archivos de una versión
 * publicada del mapa (`versioned: true`, la ruta lleva una carpeta como
 * `/v0.2.0/` y lo que hay dentro no cambia nunca) o los que no la llevan, y
 * solo algunos tipos de archivo (`files`).
 */
export function mapCachePattern(styleUrl: string | undefined, routesUrl?: string, only: MapCacheFilter = {}): RegExp | null {
    const origin = originOf(styleUrl);

    if (origin === null) {
        return null;
    }

    const routes = originOf(routesUrl) === origin && routesUrl !== undefined ? new URL(routesUrl.trim()).pathname : null;
    // El grafo de rutas también es .json: se descarta antes de mirar la extensión.
    const withoutRoutes = routes === null ? '' : `(?!${escapeRegExp(routes.slice(1))}(?:[?#]|$))`;
    // Se mira desde la barra que sigue al host, y solo en la ruta: no en los parámetros.
    const version = only.versioned === undefined ? '' : `(?${only.versioned ? '=' : '!'}[^?#]*${VERSION_FOLDER})`;
    const files = (only.files ?? MAP_FILES).join('|');

    return new RegExp(`^${escapeRegExp(origin)}${version}/${withoutRoutes}[^?#]*\\.(?:${files})(?:[?#].*)?$`);
}
