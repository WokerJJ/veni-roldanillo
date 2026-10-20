<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent, onBeforeUnmount, watch } from 'vue';

import type { MapGeoJson, MapLayerGroup } from '@/map/layers';
import type { LocateEvent } from '@/map/locate';
import { useMap, useMapLayers } from '@/map/useMapLayers';
import type { RouteProfile, RouteState, RouteSummary } from '@/routing/directions';
import { loadRouter, RoutesOfflineError } from '@/routing/loadRouter';
import { distanceM } from '@/routing/veni-mapa/graph.ts';
import type { LngLat, Route } from '@/routing/veni-mapa/router.ts';
import { color } from '@brand/tokens.json';

/**
 * La ruta de «Cómo llegar» (#11, ADR 0020). Va dentro de `<MapView>`, como
 * RestaurantsLayer, y no pinta nada en la página: dibuja la ruta en el mapa y
 * avisa con `state` en qué va el cálculo.
 *
 * - Sale de la ubicación de «¿Dónde estoy?» (ADR 0019): si no está encendido,
 *   lo enciende, y el permiso lo pide el navegador. La posición llega por la
 *   suscripción del motor y se queda aquí, en memoria: de este componente solo
 *   salen la distancia y la duración, nunca la posición.
 * - Calcula a pie y en carro con el router de veni-mapa; el grafo baja la
 *   primera vez (loadRouter.ts). Dibuja la del perfil elegido (`profile`), y
 *   a trazos el tramo entre cada punto y la calle a la que se ajustó.
 * - Encuadra la ruta la primera vez, y cuando cambia el perfil, en lo que el
 *   panel de la página deja a la vista. Mientras quien la sigue camina, la
 *   ruta se recalcula sin mover la cámara.
 * - Va debajo de las etiquetas del mapa base (no tapa los nombres de las
 *   calles) y de los restaurantes.
 *
 * Este componente y el router llegan con import(): no pesan en el arranque.
 */
const LINE_SOURCE = 'route';
const SNAP_SOURCE = 'route-snap';

/** Lo que hay que moverse para recalcular la ruta, en metros: menos es el error del GPS. */
const RECALCULATE_AFTER_M = 25;
/** Un ajuste a la calle más corto que esto no se dibuja. */
const MIN_SNAP_M = 5;

const ARREBOL = color.arrebol.$value;
const BLANCO = color.blanco.$value;

const EMPTY: MapGeoJson = { type: 'FeatureCollection', features: [] };

const GROUP: MapLayerGroup = {
    id: 'route',
    // Debajo de los restaurantes (20) y de las etiquetas del mapa base.
    order: 10,
    belowLabels: true,
    sources: {
        [LINE_SOURCE]: { type: 'geojson', data: EMPTY },
        [SNAP_SOURCE]: { type: 'geojson', data: EMPTY },
    },
    layers: [
        {
            id: 'route-casing',
            type: 'line',
            source: LINE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': BLANCO, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 12] },
        },
        {
            id: 'route-line',
            type: 'line',
            source: LINE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ARREBOL, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 7] },
        },
        {
            id: 'route-snap',
            type: 'line',
            source: SNAP_SOURCE,
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': ARREBOL, 'line-width': 3, 'line-dasharray': [0.5, 2] },
        },
    ],
};

export default defineComponent({
    name: 'RouteLayer',
    props: {
        /** El restaurante, `[longitud, latitud]`. */
        destination: { type: Array as unknown as PropType<[number, number]>, required: true },
        profile: { type: String as PropType<RouteProfile>, required: true },
        /** Cambia con «Reintentar»: vuelve a pedir la ubicación o el grafo. */
        attempt: { type: Number, required: true },
    },
    emits: {
        state: (state: RouteState) => typeof state.status === 'string',
    },
    setup(props, { emit }) {
        const { map } = useMap();
        const layers = useMapLayers(GROUP);

        /** La última posición que llegó. Solo en memoria: no sale de aquí. */
        let position: LngLat | null = null;
        /** De dónde sale la ruta que se ve, y las de cada perfil. */
        let origin: LngLat | null = null;
        /** De dónde salió el último cálculo, con ruta o sin ella: hasta moverse 25 m no se repite. */
        let tried: LngLat | null = null;
        /**
         * Sin arreglo mientras la página siga abierta: el restaurante está lejos
         * de las calles o no hay con qué calcular (otro formato de grafo, sin
         * URL). Ninguna lectura nueva lo cambia.
         */
        let stopped = false;
        let routes: Record<RouteProfile, Route | null> | null = null;
        let framed = false;
        /** Cada cálculo nuevo deja viejos los que siguen en curso. */
        let run = 0;
        let disposed = false;
        function report(state: RouteState): void {
            emit('state', state);
        }

        function summary(route: Route | null): RouteSummary | null {
            return route === null ? null : { distance: route.distance, duration: route.duration };
        }

        function line(coordinates: LngLat[]): MapGeoJson {
            return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
        }

        /** Los tramos entre cada punto y la calle, si son largos como para verse. */
        function snaps(from: LngLat, route: Route): MapGeoJson {
            const first = route.coordinates[0];
            const last = route.coordinates.at(-1);
            const pieces: [LngLat, LngLat][] = [];

            if (first && route.snap.from >= MIN_SNAP_M) {
                pieces.push([from, first]);
            }

            if (last && route.snap.to >= MIN_SNAP_M) {
                pieces.push([last, props.destination]);
            }

            return { type: 'FeatureCollection', features: pieces.map((piece) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: piece } })) };
        }

        function shown(): Route | null {
            return routes?.[props.profile] ?? null;
        }

        function draw(): void {
            const route = shown();

            layers.setData(LINE_SOURCE, route ? line(route.coordinates) : EMPTY);
            layers.setData(SNAP_SOURCE, route && origin ? snaps(origin, route) : EMPTY);
        }

        function clear(): void {
            run += 1;
            routes = null;
            origin = null;
            draw();
        }

        /** Encuadra la ruta que se ve con sus dos puntas, en lo que deja libre el panel. */
        function frame(): void {
            const route = shown();

            if (route === null || origin === null) {
                return;
            }

            const points = [origin, props.destination, ...route.coordinates];
            const lons = points.map(([lon]) => lon);
            const lats = points.map(([, lat]) => lat);

            framed = true;
            map.value?.showBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]);
        }

        async function calculate(from: LngLat): Promise<void> {
            if (stopped) {
                return;
            }

            run += 1;
            tried = from;
            const mine = run;

            if (routes === null) {
                report({ status: 'calculating' });
            }

            try {
                const router = await loadRouter();

                if (mine !== run || disposed) {
                    return;
                }

                if (router.nearest(props.destination, 'foot') < 0 && router.nearest(props.destination, 'car') < 0) {
                    stopped = true;
                    clear();
                    report({ status: 'destination-far' });

                    return;
                }

                const next = { foot: router.route(from, props.destination, 'foot'), car: router.route(from, props.destination, 'car') };

                if (next.foot === null && next.car === null) {
                    const far = router.nearest(from, 'foot') < 0 && router.nearest(from, 'car') < 0;
                    clear();
                    report({ status: far ? 'far' : 'no-route' });

                    return;
                }

                origin = from;
                routes = next;
                draw();
                report({ status: 'ready', routes: { foot: summary(next.foot), car: summary(next.car) } });

                if (!framed) {
                    frame();
                }
            } catch (error) {
                if (mine === run && !disposed) {
                    // Sin señal se puede reintentar; lo demás no se arregla así.
                    const offline = error instanceof RoutesOfflineError;
                    console.error(offline ? '[ruta] No se pudo bajar el grafo de rutas.' : '[ruta] No se puede calcular la ruta.', error);
                    clear();
                    stopped = !offline;
                    // La próxima lectura vuelve a intentar bajarlo.
                    tried = null;
                    report({ status: offline ? 'offline' : 'error' });
                }
            }
        }

        function onLocate(event: LocateEvent): void {
            if (event.type === 'position') {
                position = event.at;
                const moved = tried === null || distanceM(tried[0], tried[1], position[0], position[1]) >= RECALCULATE_AFTER_M;

                // Quien camina mueve la ruta; el error del GPS, no.
                if (moved) {
                    void calculate(position);
                }

                return;
            }

            // Con la ruta a la vista, una lectura que falla no la borra: MapLibre sigue intentando.
            if (event.type === 'problem' && event.problem === 'signal' && routes !== null) {
                return;
            }

            position = null;
            tried = null;
            clear();
            report({ status: event.type === 'off' ? 'off' : event.problem });
        }

        watch(
            map,
            (handle, _previous, onCleanup) => {
                if (handle === null) {
                    return;
                }

                onCleanup(handle.watchPosition(onLocate));
                handle.requestPosition();
            },
            { immediate: true },
        );

        watch(
            () => props.profile,
            () => {
                draw();
                frame();
            },
        );

        watch(
            () => props.attempt,
            () => {
                framed = false;

                if (position === null) {
                    report({ status: 'locating' });
                    map.value?.requestPosition();
                } else {
                    void calculate(position);
                }
            },
        );

        onBeforeUnmount(() => {
            disposed = true;
            position = null;
            origin = null;
            tried = null;
            routes = null;
        });

        return () => null;
    },
});
</script>
