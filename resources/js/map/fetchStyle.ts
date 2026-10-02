// Solo el tipo: este módulo va en el bundle de la página y no trae MapLibre.
import type { StyleSpecification } from 'maplibre-gl';

/**
 * Descarga un estilo de veni-mapa. Vive fuera del motor (resources/js/map/engine.ts)
 * para que la pantalla pueda pedir el estilo a la vez que baja el código del
 * mapa, en vez de esperar a tenerlo.
 */
export async function fetchMapStyle(url: string, signal: AbortSignal): Promise<StyleSpecification> {
    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(`Estilo del mapa: HTTP ${String(response.status)} en ${url}`);
    }

    return (await response.json()) as StyleSpecification;
}
