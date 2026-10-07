/**
 * Registro de las capas propias de un mapa (ADR 0016). Lo crea el motor
 * (resources/js/map/engine.ts) y viaja con él en el chunk perezoso; de MapLibre
 * solo usa los tipos y el mapa que recibe.
 *
 * `setStyle` con otro estilo borra todo lo añadido en ejecución: fuentes,
 * capas e imágenes. El registro guarda lo que la app puso y:
 *
 * - le da a MapLibre un `transformStyle` que mete las fuentes y las capas en el
 *   estilo que llega, antes de aplicarlo: aparecen con él, sin un cuadro vacío;
 * - vuelve a poner las imágenes cuando el estilo carga («style.load»), antes
 *   de que MapLibre arme los símbolos que las usan.
 */
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, StyleSpecification, TransformStyleFunction } from 'maplibre-gl';

import type { MapGeoJson, MapHit, MapLayerGroup, MapLayerGroupHandle } from './layers';

/** Medio lado del área táctil de una figura: 44 px en total (regla 9 de producto). */
const TOUCH_RADIUS = 22;

interface Registered {
    group: MapLayerGroup;
    /** Los últimos datos de cada fuente: los del grupo, o los de `setData`. */
    data: Map<string, MapGeoJson>;
    /** Orden de llegada, para desempatar grupos con el mismo `order`. */
    sequence: number;
}

export interface LayerRegistry {
    add(group: MapLayerGroup): MapLayerGroupHandle;
    /** Para `map.setStyle`: el estilo que llega, con las capas propias encima. */
    readonly transformStyle: TransformStyleFunction;
    /**
     * Se le pidió otro estilo a MapLibre. Hasta que cargue no deja tocar
     * fuentes ni capas: los cambios solo se anotan y entran con él.
     */
    styleRequested(): void;
    /** El mapa se liberó: lo que quede registrado ya no hace nada. */
    dispose(): void;
}

function assertOwnIds(group: MapLayerGroup): void {
    const ids = [...Object.keys(group.sources), ...group.layers.map((layer) => layer.id), ...Object.keys(group.images ?? {})];
    const foreign = ids.filter((id) => id !== group.id && !id.startsWith(`${group.id}-`));

    if (foreign.length > 0) {
        throw new Error(`Las fuentes, capas e imágenes del grupo «${group.id}» llevan su id como prefijo: ${foreign.join(', ')}.`);
    }
}

export function createLayerRegistry(map: MapLibreMap): LayerRegistry {
    const groups = new Map<string, Registered>();
    let nextSequence = 0;
    /** Estilos pedidos que todavía no cargaron. */
    let stylesLoading = 0;
    let disposed = false;

    /** De abajo hacia arriba, como se pintan. */
    const ordered = (): Registered[] =>
        [...groups.values()].sort((a, b) => (a.group.order ?? 0) - (b.group.order ?? 0) || a.sequence - b.sequence);

    const styleReady = (): boolean => !disposed && stylesLoading === 0;

    const sourcesOf = ({ group, data }: Registered): StyleSpecification['sources'] =>
        Object.fromEntries(Object.entries(group.sources).map(([id, source]) => [id, { ...source, data: data.get(id) ?? source.data }]));

    const addImages = ({ group }: Registered): void => {
        for (const [id, image] of Object.entries(group.images ?? {})) {
            if (!map.hasImage(id)) {
                map.addImage(id, image.data, { pixelRatio: image.pixelRatio ?? 1 });
            }
        }
    };

    /** La primera capa, ya en el mapa, de los grupos que van encima de este. */
    const firstLayerAbove = (registered: Registered): string | undefined => {
        const above = ordered();

        return above
            .slice(above.indexOf(registered) + 1)
            .flatMap((other) => other.group.layers)
            .find((layer) => map.getLayer(layer.id) !== undefined)?.id;
    };

    const attach = (registered: Registered): void => {
        addImages(registered);

        for (const [id, source] of Object.entries(sourcesOf(registered))) {
            map.addSource(id, source);
        }

        const before = firstLayerAbove(registered);

        for (const layer of registered.group.layers) {
            map.addLayer(layer, before);
        }
    };

    const detach = ({ group }: Registered): void => {
        for (const layer of group.layers) {
            if (map.getLayer(layer.id) !== undefined) {
                map.removeLayer(layer.id);
            }
        }

        for (const id of Object.keys(group.sources)) {
            if (map.getSource(id) !== undefined) {
                map.removeSource(id);
            }
        }

        for (const id of Object.keys(group.images ?? {})) {
            if (map.hasImage(id)) {
                map.removeImage(id);
            }
        }
    };

    const remove = (registered: Registered): void => {
        if (disposed || groups.get(registered.group.id) !== registered) {
            return;
        }

        groups.delete(registered.group.id);

        if (styleReady()) {
            detach(registered);
        }
    };

    /** La figura tocable más cercana al punto, del grupo que esté más arriba. */
    const hitAt = (point: { x: number; y: number }): { registered: Registered; hit: MapHit } | null => {
        if (!styleReady()) {
            return null;
        }

        for (const registered of ordered().reverse()) {
            const layers = (registered.group.interaction?.layers ?? []).filter((id) => map.getLayer(id) !== undefined);

            if (layers.length === 0) {
                continue;
            }

            const features = map.queryRenderedFeatures(
                [
                    [point.x - TOUCH_RADIUS, point.y - TOUCH_RADIUS],
                    [point.x + TOUCH_RADIUS, point.y + TOUCH_RADIUS],
                ],
                { layers },
            );
            let nearest: MapHit | null = null;
            let nearestDistance = Infinity;

            for (const feature of features) {
                const coordinates = feature.geometry.type === 'Point' ? ([feature.geometry.coordinates[0], feature.geometry.coordinates[1]] as [number, number]) : null;
                const at = coordinates === null ? null : map.project(coordinates);
                // Lo que no es un punto no tiene un centro con el que medir: queda detrás de los puntos.
                const distance = at === null ? Number.MAX_VALUE : (at.x - point.x) ** 2 + (at.y - point.y) ** 2;

                if (distance < nearestDistance) {
                    nearest = { layer: feature.layer.id, properties: feature.properties, coordinates };
                    nearestDistance = distance;
                }
            }

            if (nearest !== null) {
                return { registered, hit: nearest };
            }
        }

        return null;
    };

    map.on('style.load', () => {
        stylesLoading = Math.max(0, stylesLoading - 1);

        // Con otro estilo en camino, las imágenes entran cuando cargue ese.
        if (styleReady()) {
            for (const registered of groups.values()) {
                addImages(registered);
            }
        }
    });

    map.on('click', (event: MapMouseEvent) => {
        const found = hitAt(event.point);

        found?.registered.group.interaction?.onSelect(found.hit);
    });

    // Con ratón, el cursor dice dónde se puede hacer clic.
    map.on('mousemove', (event: MapMouseEvent) => {
        map.getCanvas().style.cursor = hitAt(event.point) === null ? '' : 'pointer';
    });

    return {
        add(group) {
            assertOwnIds(group);

            // Registrar otra vez el mismo id reemplaza al grupo anterior.
            const previous = groups.get(group.id);

            if (previous) {
                remove(previous);
            }

            const registered: Registered = { group, data: new Map(), sequence: nextSequence };
            nextSequence += 1;

            if (disposed) {
                return { setData: () => undefined, expandCluster: () => undefined, remove: () => undefined };
            }

            groups.set(group.id, registered);

            if (styleReady()) {
                attach(registered);
            }

            const isCurrent = (): boolean => !disposed && groups.get(group.id) === registered;

            return {
                setData(sourceId, data) {
                    if (!Object.hasOwn(group.sources, sourceId)) {
                        throw new Error(`El grupo «${group.id}» no tiene la fuente «${sourceId}».`);
                    }

                    if (!isCurrent()) {
                        return;
                    }

                    registered.data.set(sourceId, data);

                    if (styleReady()) {
                        // No se rechaza: si falla, MapLibre avisa con su evento «error».
                        void map.getSource<GeoJSONSource>(sourceId)?.setData(data);
                    }
                },
                expandCluster(sourceId, clusterId, center) {
                    if (!isCurrent() || !styleReady()) {
                        return;
                    }

                    map.getSource<GeoJSONSource>(sourceId)
                        ?.getClusterExpansionZoom(clusterId)
                        .then((zoom) => {
                            if (isCurrent()) {
                                map.easeTo({ center, zoom });
                            }
                        })
                        // Los datos cambiaron y ese grupo de puntos ya no existe: no hay adónde acercar.
                        .catch(() => undefined);
                },
                remove() {
                    remove(registered);
                },
            };
        },

        transformStyle: (_previous, next) => {
            const own = ordered();

            return {
                ...next,
                sources: Object.assign({}, next.sources, ...own.map(sourcesOf)) as StyleSpecification['sources'],
                layers: [...next.layers, ...own.flatMap(({ group }) => group.layers)],
            };
        },

        styleRequested() {
            stylesLoading += 1;
        },

        dispose() {
            disposed = true;
            groups.clear();
        },
    };
}
