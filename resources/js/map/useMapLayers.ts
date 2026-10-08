import type { InjectionKey, MaybeRefOrGetter, ShallowRef } from 'vue';
import { inject, onBeforeUnmount, toValue, watch } from 'vue';

// Solo los tipos: MapLibre no entra al bundle de quien pinta capas (ADR 0007).
import type { MapHandle } from './engine';
import type { MapGeoJson, MapLayerGroup, MapLayerGroupHandle } from './layers';

/** Lo que `<MapView>` les da a los componentes que lleva adentro (ADR 0016). */
export interface MapContext {
    /**
     * El mapa cuando ya pinta; `null` mientras carga, si falló o después de
     * desmontarse. Tras «Reintentar» es otro mapa.
     */
    readonly map: Readonly<ShallowRef<MapHandle | null>>;
}

export const MAP_CONTEXT: InjectionKey<MapContext> = Symbol('veni:map');

/** El mapa del `<MapView>` que contiene a este componente. */
export function useMap(): MapContext {
    const context = inject(MAP_CONTEXT, null);

    if (context === null) {
        throw new Error('Este componente pinta sobre el mapa: va dentro de <MapView>.');
    }

    return context;
}

export interface MapLayers {
    /** Cambia los datos de una fuente del grupo. Se puede llamar antes de que haya mapa. */
    setData(sourceId: string, data: MapGeoJson): void;
    /** Acerca el mapa hasta que un grupo de puntos se separa. */
    expandCluster(sourceId: string, clusterId: number, center: [number, number]): void;
}

/**
 * Pone un grupo de capas propias en el mapa de `<MapView>` mientras viva el
 * componente que la llama:
 *
 *     <MapView><RestaurantsLayer /></MapView>
 *
 * Lo registra cuando el mapa ya pinta, lo vuelve a registrar si el mapa se
 * rehace («Reintentar») o si el grupo cambia, y lo quita al desmontar. Que
 * siga ahí al cambiar de tema o de idioma es cosa del motor. Los datos van
 * aparte, con `setData`: cambiarlos no rehace las capas.
 */
export function useMapLayers(group: MaybeRefOrGetter<MapLayerGroup>): MapLayers {
    const { map } = useMap();
    /** Los últimos datos de cada fuente, para el próximo registro. */
    const data = new Map<string, MapGeoJson>();
    let registered: MapLayerGroupHandle | null = null;

    watch(
        [map, () => toValue(group)],
        ([current, definition]) => {
            // Si el mapa anterior ya se liberó, quitarlo de ahí no hace nada.
            registered?.remove();
            registered = null;

            if (current === null) {
                return;
            }

            registered = current.addLayerGroup({
                ...definition,
                sources: Object.fromEntries(
                    Object.entries(definition.sources).map(([id, source]) => [id, { ...source, data: data.get(id) ?? source.data }]),
                ),
            });
        },
        { immediate: true },
    );

    onBeforeUnmount(() => {
        registered?.remove();
        registered = null;
    });

    return {
        setData(sourceId, next) {
            data.set(sourceId, next);
            registered?.setData(sourceId, next);
        },
        expandCluster(sourceId, clusterId, center) {
            registered?.expandCluster(sourceId, clusterId, center);
        },
    };
}
