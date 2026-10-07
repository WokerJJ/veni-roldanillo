import type { Map as MapLibreMap } from 'maplibre-gl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as maplibre from '@/testing/maplibre';

import { createLayerRegistry } from './layerRegistry';
import type { MapGeoJson, MapHit, MapLayerGroup } from './layers';

/*
| El registro de capas propias (ADR 0016) contra el doble de MapLibre, que
| hace lo que importa aquí: al cambiar de estilo borra todo lo añadido en
| ejecución y no deja tocar fuentes ni capas hasta que el estilo nuevo carga.
*/

const BASE = {
    version: 8,
    name: 'claro',
    sources: { protomaps: { type: 'vector' } },
    layers: [{ id: 'background' }, { id: 'roads' }, { id: 'places' }],
};
const DARK = { ...BASE, name: 'oscuro' };
const ENGLISH = { ...BASE, name: 'claro-en' };

const EMPTY: MapGeoJson = { type: 'FeatureCollection', features: [] };

function point(slug: string, lng: number, lat: number): GeoJSON.Feature<GeoJSON.Point> {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { slug } };
}

function collection(...features: GeoJSON.Feature[]): MapGeoJson {
    return { type: 'FeatureCollection', features };
}

function restaurants(extra: Partial<MapLayerGroup> = {}): MapLayerGroup {
    return {
        id: 'restaurants',
        sources: { restaurants: { type: 'geojson', data: EMPTY, cluster: true } },
        layers: [
            { id: 'restaurants-clusters', type: 'circle', source: 'restaurants' },
            { id: 'restaurants-points', type: 'circle', source: 'restaurants' },
        ],
        ...extra,
    };
}

function route(extra: Partial<MapLayerGroup> = {}): MapLayerGroup {
    return {
        id: 'route',
        sources: { route: { type: 'geojson', data: EMPTY } },
        layers: [{ id: 'route-line', type: 'line', source: 'route' }],
        ...extra,
    };
}

function setUp() {
    const map = new maplibre.Map({ container: document.createElement('div'), style: structuredClone(BASE) });
    const registry = createLayerRegistry(map as unknown as MapLibreMap);

    return {
        map,
        registry,
        /** Como el motor al cambiar de tema o de idioma. */
        changeStyle: (style: maplibre.FakeStyle) => {
            map.setStyle(structuredClone(style), { diff: false, transformStyle: registry.transformStyle as never });
            registry.styleRequested();
        },
        layerIds: () => (map.getStyle().layers ?? []).map((layer) => layer.id),
        sourceIds: () => Object.keys(map.getStyle().sources ?? {}),
        dataOf: (id: string) => map.getStyle().sources?.[id]?.data,
    };
}

beforeEach(() => {
    maplibre.reset();
});

describe('registro de capas propias', () => {
    it('pone las fuentes y las capas del grupo encima del mapa base', () => {
        const { registry, layerIds, sourceIds } = setUp();

        registry.add(restaurants());

        expect(sourceIds()).toEqual(['protomaps', 'restaurants']);
        expect(layerIds()).toEqual(['background', 'roads', 'places', 'restaurants-clusters', 'restaurants-points']);
    });

    it('tras cambiar el tema, la capa sigue en el estilo aplicado, con sus datos', async () => {
        const { map, registry, changeStyle, layerIds, sourceIds, dataOf } = setUp();
        const data = collection(point('la-ceiba', -76.1547, 4.4128));

        registry.add(restaurants()).setData('restaurants', data);
        changeStyle(DARK);
        await Promise.resolve();

        expect(map.getStyle().name).toBe('oscuro');
        expect(sourceIds()).toEqual(['protomaps', 'restaurants']);
        expect(layerIds()).toEqual(['background', 'roads', 'places', 'restaurants-clusters', 'restaurants-points']);
        expect(dataOf('restaurants')).toEqual(data);
        // Entran con el estilo, no después: nadie las vuelve a añadir a mano.
        expect(map.addLayer).toHaveBeenCalledTimes(2);
        expect(map.addSource).toHaveBeenCalledTimes(1);
    });

    it('sin el registro, el cambio de estilo las borra: de eso protege', async () => {
        const { map, registry, layerIds } = setUp();

        registry.add(restaurants());
        map.setStyle(structuredClone(DARK), { diff: false });
        await Promise.resolve();

        expect(layerIds()).toEqual(['background', 'roads', 'places']);
    });

    it('tras cambiar el tema y después el idioma, sigue ahí', async () => {
        const { registry, changeStyle, layerIds, map } = setUp();

        registry.add(restaurants());
        changeStyle(DARK);
        await Promise.resolve();
        changeStyle(ENGLISH);
        await Promise.resolve();

        expect(map.getStyle().name).toBe('claro-en');
        expect(layerIds()).toContain('restaurants-points');
    });

    it('vuelve a poner las imágenes del grupo cuando el estilo nuevo carga', async () => {
        const { map, registry, changeStyle } = setUp();
        const marker = { data: { width: 2, height: 2, data: new Uint8ClampedArray(16) } as ImageData, pixelRatio: 2 };

        registry.add(restaurants({ images: { 'restaurants-marker': marker } }));

        expect(map.addImage).toHaveBeenCalledExactlyOnceWith('restaurants-marker', marker.data, { pixelRatio: 2 });

        changeStyle(DARK);
        await Promise.resolve();

        expect(map.imageIds()).toEqual(['restaurants-marker']);
        expect(map.addImage).toHaveBeenCalledTimes(2);
    });

    describe('mientras el estilo nuevo carga', () => {
        it('los datos que cambian se anotan y entran con el estilo', () => {
            const { map, registry, changeStyle, dataOf } = setUp();
            const group = registry.add(restaurants());
            const data = collection(point('el-guadual', -76.15, 4.41));
            map.holdStyleLoads = true;

            changeStyle(DARK);
            // MapLibre todavía no cargó el estilo: no hay fuente a la que darle los datos.
            expect(() => {
                group.setData('restaurants', data);
            }).not.toThrow();

            map.finishStyleLoad();

            expect(dataOf('restaurants')).toEqual(data);
        });

        it('un grupo que se registra entra con el estilo, sin tocar un mapa a medio cargar', () => {
            const { map, registry, changeStyle, layerIds } = setUp();
            map.holdStyleLoads = true;

            changeStyle(DARK);
            registry.add(restaurants());

            expect(map.addSource).not.toHaveBeenCalled();
            expect(map.addLayer).not.toHaveBeenCalled();

            map.finishStyleLoad();

            expect(layerIds()).toEqual(['background', 'roads', 'places', 'restaurants-clusters', 'restaurants-points']);
        });

        it('un grupo que se quita no vuelve con el estilo', () => {
            const { map, registry, changeStyle, layerIds, sourceIds } = setUp();
            const group = registry.add(restaurants());
            map.holdStyleLoads = true;

            changeStyle(DARK);
            group.remove();
            map.finishStyleLoad();

            expect(layerIds()).toEqual(['background', 'roads', 'places']);
            expect(sourceIds()).toEqual(['protomaps']);
        });

        it('con dos estilos pedidos seguidos, espera al último antes de volver a tocar el mapa', () => {
            const { map, registry, changeStyle, dataOf } = setUp();
            const group = registry.add(restaurants());
            const first = collection(point('la-ceiba', -76.1547, 4.4128));
            const second = collection(point('el-guadual', -76.15, 4.41));
            map.holdStyleLoads = true;

            changeStyle(DARK);
            changeStyle(ENGLISH);
            // Carga el primero; MapLibre ya empezó con el segundo y sigue sin dejar tocar nada.
            map.finishStyleLoad();

            expect(() => {
                group.setData('restaurants', first);
            }).not.toThrow();
            expect(map.getSource('restaurants')).toBeUndefined();

            map.finishStyleLoad();

            expect(dataOf('restaurants')).toEqual(first);

            // Ya cargado, los datos van directo a la fuente.
            group.setData('restaurants', second);

            expect(map.getSource('restaurants')?.setData).toHaveBeenCalledExactlyOnceWith(second);
            expect(dataOf('restaurants')).toEqual(second);
        });

        it('un toque no consulta capas de un estilo que todavía no cargó', () => {
            const { map, registry, changeStyle } = setUp();
            const onSelect = vi.fn();
            registry.add(restaurants({ interaction: { layers: ['restaurants-points'], onSelect } }));
            map.holdStyleLoads = true;

            changeStyle(DARK);
            map.click({ x: 10, y: 10 });

            expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
            expect(onSelect).not.toHaveBeenCalled();
        });
    });

    describe('orden', () => {
        it('un grupo con order menor queda debajo aunque se registre después', () => {
            const { registry, layerIds } = setUp();

            registry.add(restaurants({ order: 20 }));
            registry.add(route({ order: 10 }));

            expect(layerIds()).toEqual(['background', 'roads', 'places', 'route-line', 'restaurants-clusters', 'restaurants-points']);
        });

        it('el orden se conserva al cambiar de estilo', async () => {
            const { registry, changeStyle, layerIds } = setUp();

            registry.add(restaurants({ order: 20 }));
            registry.add(route({ order: 10 }));
            changeStyle(DARK);
            await Promise.resolve();

            expect(layerIds()).toEqual(['background', 'roads', 'places', 'route-line', 'restaurants-clusters', 'restaurants-points']);
        });

        it('con el mismo order, el que se registra después queda encima', () => {
            const { registry, layerIds } = setUp();

            registry.add(route());
            registry.add(restaurants());

            expect(layerIds().slice(3)).toEqual(['route-line', 'restaurants-clusters', 'restaurants-points']);
        });
    });

    describe('quitar y reemplazar', () => {
        it('quitar el grupo saca sus capas, sus fuentes y sus imágenes, y deja el mapa base', () => {
            const { map, registry, layerIds, sourceIds } = setUp();
            const marker = { data: { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData };
            const group = registry.add(restaurants({ images: { 'restaurants-marker': marker } }));

            group.remove();

            expect(layerIds()).toEqual(['background', 'roads', 'places']);
            expect(sourceIds()).toEqual(['protomaps']);
            expect(map.imageIds()).toEqual([]);
        });

        it('quitarlo dos veces no falla', () => {
            const { registry } = setUp();
            const group = registry.add(restaurants());

            group.remove();

            expect(() => {
                group.remove();
            }).not.toThrow();
        });

        it('registrar otra vez el mismo id reemplaza al anterior', () => {
            const { registry, layerIds } = setUp();
            const old = registry.add(restaurants());

            registry.add({
                id: 'restaurants',
                sources: { restaurants: { type: 'geojson', data: EMPTY } },
                layers: [{ id: 'restaurants-icons', type: 'symbol', source: 'restaurants' }],
            });

            expect(layerIds()).toEqual(['background', 'roads', 'places', 'restaurants-icons']);

            // Lo que quedó del anterior ya no toca al nuevo.
            old.setData('restaurants', collection(point('la-ceiba', -76.1547, 4.4128)));
            old.remove();

            expect(layerIds()).toEqual(['background', 'roads', 'places', 'restaurants-icons']);
        });

        it('no deja cambiar los datos de una fuente que el grupo no tiene', () => {
            const { registry } = setUp();
            const group = registry.add(restaurants());

            expect(() => {
                group.setData('protomaps', EMPTY);
            }).toThrow('no tiene la fuente «protomaps»');
        });

        it.each([
            ['una fuente', { sources: { pois: { type: 'geojson', data: EMPTY } } }],
            ['una capa', { layers: [{ id: 'places', type: 'circle', source: 'restaurants' }] }],
            ['una imagen', { images: { marker: { data: {} as ImageData } } }],
        ] as const)('rechaza %s cuyo id no lleva el del grupo: chocaría con el mapa base o con otro grupo', (_what, extra) => {
            const { map, registry } = setUp();

            expect(() => registry.add(restaurants(extra as Partial<MapLayerGroup>))).toThrow('llevan su id como prefijo');
            expect(map.addSource).not.toHaveBeenCalled();
        });

        it('con el mapa ya liberado, registrar o cambiar datos no hace nada', () => {
            const { map, registry } = setUp();
            const before = registry.add(restaurants());

            registry.dispose();

            expect(() => {
                before.setData('restaurants', EMPTY);
                before.remove();
                registry.add(route()).setData('route', EMPTY);
            }).not.toThrow();
            expect(map.removeLayer).not.toHaveBeenCalled();
            expect(map.addSource).toHaveBeenCalledTimes(1);
        });
    });

    describe('toques', () => {
        const LA_CEIBA = point('la-ceiba', -76.1547, 4.4128);
        /** A 30 px de La Ceiba en la proyección del doble. */
        const EL_GUADUAL = point('el-guadual', -76.15467, 4.4128);

        function rendered(feature: GeoJSON.Feature<GeoJSON.Point>, layer = 'restaurants-points'): maplibre.RenderedFeature {
            return { layer: { id: layer }, properties: feature.properties ?? {}, geometry: feature.geometry };
        }

        function setUpTouch() {
            const context = setUp();
            const onSelect = vi.fn<(hit: MapHit) => void>();

            context.registry.add(restaurants({ interaction: { layers: ['restaurants-points'], onSelect } }));
            context.map.render([rendered(LA_CEIBA), rendered(EL_GUADUAL)]);

            const at = (feature: GeoJSON.Feature<GeoJSON.Point>, dx = 0, dy = 0) => {
                const { x, y } = context.map.project(feature.geometry.coordinates as [number, number]);

                return { x: x + dx, y: y + dy };
            };

            return { ...context, onSelect, at };
        }

        it('tocar una figura avisa al grupo con sus propiedades y dónde está', () => {
            const { map, onSelect, at } = setUpTouch();

            map.click(at(LA_CEIBA));

            expect(onSelect).toHaveBeenCalledExactlyOnceWith({
                layer: 'restaurants-points',
                properties: { slug: 'la-ceiba' },
                coordinates: [-76.1547, 4.4128],
            });
        });

        it('el área táctil mide 44 px: a 21 px del centro, en diagonal, todavía cuenta', () => {
            const { map, onSelect, at } = setUpTouch();

            map.click(at(LA_CEIBA, -21, 21));

            expect(onSelect).toHaveBeenCalledOnce();
            expect(onSelect.mock.calls[0]?.[0].properties.slug).toBe('la-ceiba');
        });

        it('más lejos ya no', () => {
            const { map, onSelect, at } = setUpTouch();

            map.click(at(LA_CEIBA, -23, 0));

            expect(onSelect).not.toHaveBeenCalled();
        });

        it('entre dos figuras cercanas gana la más próxima al toque', () => {
            const { map, onSelect, at } = setUpTouch();

            // Un toque entre las dos, a 20 px de la primera y a 10 de la segunda, alcanza a ambas.
            map.click(at(EL_GUADUAL, -10, 0));

            expect(onSelect.mock.calls[0]?.[0].properties.slug).toBe('el-guadual');
        });

        it('solo consulta las capas que el grupo declaró tocables', () => {
            const { map, onSelect, at } = setUpTouch();
            map.render([rendered(LA_CEIBA, 'restaurants-clusters')]);

            map.click(at(LA_CEIBA));

            expect(onSelect).not.toHaveBeenCalled();
        });

        it('si dos grupos tienen algo en el punto, gana el que está encima', () => {
            const { map, registry, onSelect, at } = setUpTouch();
            const onRoute = vi.fn();
            registry.add(route({ order: -1, interaction: { layers: ['route-line'], onSelect: onRoute } }));
            map.render([rendered(LA_CEIBA), rendered(LA_CEIBA, 'route-line')]);

            map.click(at(LA_CEIBA));

            expect(onSelect).toHaveBeenCalledOnce();
            expect(onRoute).not.toHaveBeenCalled();
        });

        it('con ratón, el cursor avisa dónde se puede hacer clic', () => {
            const { map, at } = setUpTouch();

            map.hover(at(LA_CEIBA, 5, 5));
            expect(map.getCanvas().style.cursor).toBe('pointer');

            map.hover(at(LA_CEIBA, 300, 0));
            expect(map.getCanvas().style.cursor).toBe('');
        });

        it('acercar un grupo de puntos lleva la cámara al zoom en que se separa', async () => {
            const { map, registry } = setUp();
            const group = registry.add(restaurants());
            const source = map.getSource('restaurants');

            if (source) {
                source.expansionZoom = 17;
            }

            group.expandCluster('restaurants', 7, [-76.1547, 4.4128]);
            await Promise.resolve();

            expect(source?.getClusterExpansionZoom).toHaveBeenCalledExactlyOnceWith(7);
            expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: [-76.1547, 4.4128], zoom: 17 });
        });
    });
});
