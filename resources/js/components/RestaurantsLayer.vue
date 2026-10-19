<script lang="ts">
import type { PropType } from 'vue';
import { computed, defineComponent, onBeforeUnmount, shallowRef, watch } from 'vue';

import { loadIcon } from '@/icons/icons';
import { iconImage } from '@/map/iconImage';
import type { MapGeoJson, MapHit, MapImage, MapLayerGroup } from '@/map/layers';
import { useMap, useMapLayers } from '@/map/useMapLayers';
import type { Restaurant } from '@/restaurants/api';
import tokens from '@brand/tokens.json';

/**
 * Los restaurantes sobre el mapa (#9). Va dentro de `<MapView>` y no pinta
 * nada en la página: registra sus capas en el mapa (ADR 0016) y avisa con
 * `select` cuando alguien toca un restaurante.
 *
 * - Cada restaurante es un círculo arrebol con borde blanco y un ícono; los que
 *   se superponen se juntan en un círculo blanco con borde arrebol y la
 *   cantidad, que al tocarlo acerca el mapa hasta separarlos.
 * - El elegido (`selected`) lleva un halo. Si se eligió desde fuera del mapa
 *   (la lista, o la dirección con que se abrió el inicio: `?r=slug`), la
 *   cámara va hasta él, lo bastante cerca para que no quede dentro de un
 *   grupo. Si el mapa todavía no pinta, va cuando empieza a pintar.
 * - Los colores son los mismos en el tema claro y en el oscuro: arrebol con
 *   borde blanco, y blanco con borde arrebol, se distinguen sobre los dos
 *   fondos del mapa (lila y ciruela).
 *
 * Un mapa no se puede recorrer con el teclado ni con un lector de pantalla:
 * la alternativa es la lista de restaurantes de la página (RestaurantList.vue).
 */

const SOURCE = 'restaurants';
const SELECTED_SOURCE = 'restaurants-selected';
const CLUSTERS = 'restaurants-clusters';
const POINTS = 'restaurants-points';
const MARKER = 'restaurants-marker';

/** Con qué ícono de colombia-icons se marca un restaurante. */
const MARKER_ICON = 'sancocho';
/** Radio del círculo de un restaurante y lado de su ícono, en px. */
const POINT_RADIUS = 13;
const MARKER_SIZE = 18;

/** Sobre el mapa base; la ruta (#11) irá debajo y la ubicación (#10), encima. */
const ORDER = 20;

/** Hasta este zoom se juntan los restaurantes que se superponen; más cerca, cada uno es un punto. */
const CLUSTER_MAX_ZOOM = 15;
/** Zoom al que se lleva la cámara para ver uno elegido desde la lista. */
const SELECTED_ZOOM = CLUSTER_MAX_ZOOM + 1;

const ARREBOL = tokens.color.arrebol.$value;
const CIRUELA = tokens.color.ciruela.$value;
const BLANCO = tokens.color.blanco.$value;

/**
 * Fuente de los números de los grupos: una de las que publica veni-mapa con
 * el estilo (los glyphs salen de su mismo origen, ADR 0014).
 */
const COUNT_FONT = ['Figtree SemiBold'];

const EMPTY: MapGeoJson = { type: 'FeatureCollection', features: [] };

function featuresOf(restaurants: readonly Restaurant[]): MapGeoJson {
    return {
        type: 'FeatureCollection',
        // Solo el slug: el resto se busca en la lista (MapLibre aplana las propiedades).
        features: restaurants.map(({ slug, coordinates }) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates },
            properties: { slug },
        })),
    };
}

/** El ícono dentro del círculo de cada restaurante. */
const POINT_ICONS: MapLayerGroup['layers'][number] = {
    id: 'restaurants-points-icon',
    type: 'symbol',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': MARKER, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
};

function group(marker: MapImage | null, onSelect: (hit: MapHit) => void): MapLayerGroup {
    return {
        id: SOURCE,
        order: ORDER,
        sources: {
            [SOURCE]: { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 32, clusterMaxZoom: CLUSTER_MAX_ZOOM },
            [SELECTED_SOURCE]: { type: 'geojson', data: EMPTY },
        },
        layers: [
            {
                id: 'restaurants-selected',
                type: 'circle',
                source: SELECTED_SOURCE,
                paint: {
                    'circle-radius': POINT_RADIUS + 9,
                    'circle-color': ARREBOL,
                    'circle-opacity': 0.25,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': ARREBOL,
                },
            },
            {
                id: CLUSTERS,
                type: 'circle',
                source: SOURCE,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': BLANCO,
                    'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 50, 25],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': ARREBOL,
                },
            },
            {
                id: 'restaurants-cluster-count',
                type: 'symbol',
                source: SOURCE,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-font': COUNT_FONT,
                    'text-size': 14,
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                },
                // Ciruela sobre blanco: el número se lee en los dos temas.
                paint: { 'text-color': CIRUELA },
            },
            {
                id: POINTS,
                type: 'circle',
                source: SOURCE,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': ARREBOL,
                    'circle-radius': POINT_RADIUS,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': BLANCO,
                },
            },
            // Sin el ícono (no bajó) quedan los círculos, que ya se pueden tocar.
            ...(marker === null ? [] : [POINT_ICONS]),
        ],
        images: marker === null ? {} : { [MARKER]: marker },
        interaction: { layers: [CLUSTERS, POINTS], onSelect },
    };
}

export default defineComponent({
    name: 'RestaurantsLayer',
    props: {
        restaurants: { type: Array as PropType<readonly Restaurant[]>, required: true },
        /** Slug del restaurante elegido, o null. */
        selected: { type: String as PropType<string | null>, default: null },
    },
    emits: {
        /** Alguien tocó un restaurante en el mapa. */
        select: (slug: string) => typeof slug === 'string',
    },
    setup(props, { emit }) {
        const { map } = useMap();
        const marker = shallowRef<MapImage | null>(null);
        /** El último que se eligió tocando el mapa: ya está a la vista, la cámara no se mueve. */
        let tapped: string | null = null;
        let alive = true;

        const layers = useMapLayers(
            computed(() =>
                group(marker.value, (hit) => {
                    if (hit.layer === CLUSTERS) {
                        const id = Number(hit.properties.cluster_id);

                        if (Number.isFinite(id) && hit.coordinates) {
                            layers.expandCluster(SOURCE, id, hit.coordinates);
                        }

                        return;
                    }

                    if (typeof hit.properties.slug === 'string') {
                        tapped = hit.properties.slug;
                        emit('select', hit.properties.slug);
                    }
                }),
            ),
        );

        // El ícono llega aparte (su chunk y decodificarlo): los círculos no lo esperan.
        loadIcon(MARKER_ICON)
            .then((art) => iconImage(art, { size: MARKER_SIZE, color: BLANCO }))
            .then((image) => {
                if (alive) {
                    marker.value = image;
                }
            })
            .catch((error: unknown) => {
                if (import.meta.env.DEV) {
                    console.warn('[mapa] Los restaurantes van sin ícono: no se pudo preparar.', error);
                }
            });

        onBeforeUnmount(() => {
            alive = false;
        });

        watch(
            () => props.restaurants,
            (restaurants) => {
                layers.setData(SOURCE, featuresOf(restaurants));
            },
            { immediate: true },
        );

        const selectedRestaurant = computed(() => props.restaurants.find(({ slug }) => slug === props.selected) ?? null);

        watch(
            selectedRestaurant,
            (restaurant, previous) => {
                layers.setData(SELECTED_SOURCE, featuresOf(restaurant ? [restaurant] : []));

                // Elegido desde la lista (o el mismo, con otros datos tras cambiar de idioma: ahí no).
                if (restaurant && restaurant.slug !== previous?.slug && restaurant.slug !== tapped) {
                    map.value?.showPoint(restaurant.coordinates, { minZoom: SELECTED_ZOOM });
                }

                if (!restaurant || restaurant.slug !== tapped) {
                    tapped = null;
                }
            },
            { immediate: true },
        );

        // El elegido llegó antes que el mapa (el inicio abierto con ?r=slug,
        // que elige apenas llega la lista) o el mapa se rehízo («Reintentar»):
        // el mapa nuevo abre con su cámara de siempre, y va hasta el elegido.
        watch(map, (current) => {
            const restaurant = selectedRestaurant.value;

            if (current && restaurant) {
                current.showPoint(restaurant.coordinates, { minZoom: SELECTED_ZOOM });
            }
        });

        return () => null;
    },
});
</script>
