/**
 * El router de veni-mapa sobre el grafo de rutas de Roldanillo (ADR 0020).
 *
 * El grafo (`VITE_MAP_ROUTES_URL`, más de 500 kB sin comprimir) se pide la
 * primera vez que alguien quiere una ruta, nunca al abrir el mapa: este módulo
 * llega con el componente de la ruta, que se carga con `import()`. Queda en la
 * caché de la PWA (`veni-map-routes`, runtimeCaching.ts) y en memoria mientras
 * la página siga abierta. Si la descarga falla (sin señal), se olvida el
 * intento: la próxima ruta lo vuelve a pedir.
 *
 * El pedido es una URL fija, la misma para todos: no lleva nada de quien la
 * pide, ni su posición ni el restaurante.
 */
import type { RoutingGraph } from './veni-mapa/graph.ts';
import { Router } from './veni-mapa/router.ts';

/** Sin URL del grafo (falta la variable al compilar) no hay rutas. */
export class RoutesUnavailableError extends Error {}

let loading: Promise<Router> | null = null;

async function download(url: string): Promise<Router> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`No se pudo descargar el grafo de rutas (HTTP ${String(response.status)}).`);
    }

    // El router comprueba el formato y la versión: con otro, no arranca.
    return new Router((await response.json()) as RoutingGraph);
}

/** El router, ya con el grafo: lo descarga la primera vez. */
export function loadRouter(url: string | undefined = import.meta.env.VITE_MAP_ROUTES_URL): Promise<Router> {
    if (url === undefined || url.trim() === '') {
        return Promise.reject(new RoutesUnavailableError('Falta VITE_MAP_ROUTES_URL: la app no sabe de dónde bajar el grafo de rutas.'));
    }

    loading ??= download(url.trim()).catch((error: unknown) => {
        loading = null;
        throw error;
    });

    return loading;
}
