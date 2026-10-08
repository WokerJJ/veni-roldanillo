import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import type { MapImage } from '@/map/layers';
import type { Restaurant } from '@/restaurants/api';
import type * as FakeInertia from '@/testing/inertia';
import type * as FakeMapLibre from '@/testing/maplibre';
import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
vi.mock('maplibre-gl', () => import('@/testing/maplibre'));
vi.mock('pmtiles', () => ({
    Protocol: class {
        tile = vi.fn();
    },
}));

/** El ícono ya dibujado: happy-dom no decodifica imágenes. */
const MARKER: MapImage = { data: { width: 36, height: 36, data: new Uint8ClampedArray(36 * 36 * 4) } as ImageData, pixelRatio: 2 };
const iconImage = vi.fn<() => Promise<MapImage>>();
vi.mock('@/map/iconImage', () => ({ iconImage: () => iconImage() }));

const STYLE = { version: 8, center: [-76.1547, 4.4128], zoom: 13.5, sources: {}, layers: [{ id: 'background' }, { id: 'places' }] };
/** Lo que puede tardar un import() en frío con la máquina cargada: más que el segundo que espera vi.waitFor. */
const IMPORT_TIMEOUT = 10_000;

/**
 * El mapa con la capa de restaurantes adentro, ya pintando. Quien lo monta
 * (como la página del inicio) tiene la lista y el elegido.
 */
async function mountLayer(initial: readonly Restaurant[] = [LA_CEIBA, EL_GUADUAL]) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    const maplibre = (await import('maplibre-gl')) as unknown as typeof FakeMapLibre;
    inertia.reset();
    maplibre.reset();
    inertia.receiveFromServer('es', { replace: true });
    document.documentElement.dataset.theme = 'light';

    const { default: MapView } = await import('./MapView.vue');
    const { default: RestaurantsLayer } = await import('./RestaurantsLayer.vue');
    const { default: ThemeToggle } = await import('./ThemeToggle.vue');
    const restaurants = ref(initial);
    const selected = ref<string | null>(null);
    const onSelect = vi.fn<(slug: string) => void>();
    const wrapper = mount(
        defineComponent({
            render: () => [
                h(ThemeToggle),
                h(MapView, null, { default: () => h(RestaurantsLayer, { restaurants: restaurants.value, selected: selected.value, onSelect }) }),
            ],
        }),
    );

    // El motor del mapa llega con import().
    await vi.waitFor(
        () => {
            expect(maplibre.maps).toHaveLength(1);
        },
        { timeout: IMPORT_TIMEOUT },
    );
    const map = maplibre.maps[0] as FakeMapLibre.Map;
    map.fire('load');
    await flushPromises();
    // El ícono llega con su propio import(), cuando quiere: las capas quedan
    // como van a quedar recién cuando ya se preparó (o falló) y se registró.
    await vi.waitFor(
        () => {
            expect(iconImage).toHaveBeenCalled();
        },
        { timeout: IMPORT_TIMEOUT },
    );
    await flushPromises();

    const source = (id: string) => map.getStyle().sources?.[id];
    const slugsIn = (id: string) => (source(id)?.data as { features: { properties: { slug: string } }[] }).features.map((feature) => feature.properties.slug);

    return {
        wrapper,
        map,
        restaurants,
        selected,
        onSelect,
        source,
        slugsIn,
        layerIds: () => (map.getStyle().layers ?? []).map((layer) => layer.id),
        layer: (id: string) => (map.getStyle().layers ?? []).find((layer) => layer.id === id),
        /** MapLibre tiene pintado ese restaurante como punto suelto, y alguien lo toca. */
        tap: ({ slug, coordinates }: Restaurant) => {
            map.render([{ layer: { id: 'restaurants-points' }, properties: { slug }, geometry: { type: 'Point', coordinates } }]);
            map.click(map.project(coordinates));
        },
        toggleTheme: () => wrapper.get('button[aria-pressed]').trigger('click'),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    iconImage.mockReset().mockResolvedValue(MARKER);
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.test/style/veni-{theme}-{locale}.json');
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...STYLE, name: url }) })),
    );
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

afterEach(async () => {
    // Si un import() quedó en camino, que llegue aquí: en la prueba siguiente
    // el montaje de esta crearía su mapa entre los de ella.
    await vi.dynamicImportSettled();
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.theme;
});

describe('RestaurantsLayer', () => {
    it('no pinta nada en la página: todo va al mapa', async () => {
        const { wrapper } = await mountLayer();

        expect(wrapper.findComponent({ name: 'RestaurantsLayer' }).html()).toBe('');
    });

    it('pone los restaurantes sobre el mapa base: grupos, puntos y sus íconos', async () => {
        const { layerIds, source, slugsIn } = await mountLayer();

        expect(layerIds()).toEqual([
            'background',
            'places',
            'restaurants-selected',
            'restaurants-clusters',
            'restaurants-cluster-count',
            'restaurants-points',
            'restaurants-points-icon',
        ]);
        expect(source('restaurants')).toMatchObject({ type: 'geojson', cluster: true });
        expect(slugsIn('restaurants')).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
    });

    it('cada restaurante va en su punto, [longitud, latitud], y lleva solo su slug', async () => {
        const { source } = await mountLayer([LA_CEIBA]);

        expect(source('restaurants')?.data).toEqual({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-76.1547, 4.4128] }, properties: { slug: 'prueba-la-ceiba' } }],
        });
    });

    it('los que se superponen se juntan y los sueltos no: cada capa filtra lo suyo', async () => {
        const { layer } = await mountLayer();

        expect(layer('restaurants-clusters')?.filter).toEqual(['has', 'point_count']);
        expect(layer('restaurants-cluster-count')?.filter).toEqual(['has', 'point_count']);
        expect(layer('restaurants-points')?.filter).toEqual(['!', ['has', 'point_count']]);
        expect(layer('restaurants-points-icon')?.filter).toEqual(['!', ['has', 'point_count']]);
    });

    it('usa los colores de la marca: arrebol con borde blanco', async () => {
        const { layer } = await mountLayer();

        expect(layer('restaurants-points')?.paint).toMatchObject({ 'circle-color': '#F0525A', 'circle-stroke-color': '#FFFFFF' });
        // El número del grupo, en ciruela sobre blanco: se lee en claro y en oscuro.
        expect(layer('restaurants-clusters')?.paint).toMatchObject({ 'circle-color': '#FFFFFF', 'circle-stroke-color': '#F0525A' });
        expect(layer('restaurants-cluster-count')?.paint).toEqual({ 'text-color': '#2A1638' });
    });

    it('el ícono es una imagen propia del mapa', async () => {
        const { map } = await mountLayer();

        expect(map.imageIds()).toEqual(['restaurants-marker']);
        expect(map.addImage).toHaveBeenLastCalledWith('restaurants-marker', MARKER.data, { pixelRatio: 2 });
    });

    it('si el ícono no se puede preparar, quedan los círculos', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        iconImage.mockReset().mockRejectedValue(new Error('El navegador no decodificó la imagen.'));
        const { layerIds, map } = await mountLayer();

        expect(layerIds()).toEqual(['background', 'places', 'restaurants-selected', 'restaurants-clusters', 'restaurants-cluster-count', 'restaurants-points']);
        expect(map.imageIds()).toEqual([]);
    });

    it('cuando la lista cambia, cambian los puntos sin rehacer las capas', async () => {
        const { map, restaurants, slugsIn } = await mountLayer([LA_CEIBA]);
        const layersAdded = map.addLayer.mock.calls.length;

        restaurants.value = [LA_CEIBA, EL_GUADUAL];
        await flushPromises();

        expect(slugsIn('restaurants')).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
        expect(map.addLayer).toHaveBeenCalledTimes(layersAdded);
    });

    describe('tocar', () => {
        it('tocar un restaurante avisa cuál, sin mover la cámara', async () => {
            const { map, onSelect, tap } = await mountLayer();

            tap(EL_GUADUAL);

            expect(onSelect).toHaveBeenCalledExactlyOnceWith('prueba-el-guadual');
            expect(map.easeTo).not.toHaveBeenCalled();
        });

        it('el tocado, ya elegido, lleva su halo y la cámara sigue quieta: ya estaba a la vista', async () => {
            const { map, selected, slugsIn, tap } = await mountLayer();

            tap(EL_GUADUAL);
            selected.value = 'prueba-el-guadual';
            await flushPromises();

            expect(slugsIn('restaurants-selected')).toEqual(['prueba-el-guadual']);
            expect(map.easeTo).not.toHaveBeenCalled();
        });

        it('tocar un grupo acerca el mapa hasta que se separa, y no elige a nadie', async () => {
            const { map, onSelect } = await mountLayer();
            map.render([{ layer: { id: 'restaurants-clusters' }, properties: { cluster: true, cluster_id: 4, point_count: 2 }, geometry: { type: 'Point', coordinates: [-76.1543, 4.4115] } }]);

            map.click(map.project([-76.1543, 4.4115]));
            await flushPromises();

            expect(map.getSource('restaurants')?.getClusterExpansionZoom).toHaveBeenCalledExactlyOnceWith(4);
            expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: [-76.1543, 4.4115], zoom: 16 });
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('se pueden tocar los puntos y los grupos, con el área de 44 px del registro', async () => {
            const { map, onSelect } = await mountLayer();
            const { x, y } = map.project(LA_CEIBA.coordinates);
            map.render([{ layer: { id: 'restaurants-points' }, properties: { slug: LA_CEIBA.slug }, geometry: { type: 'Point', coordinates: LA_CEIBA.coordinates } }]);

            // El círculo mide 13 px de radio: a 20 px del centro el toque sigue contando.
            map.click({ x: x + 20, y: y - 20 });

            expect(onSelect).toHaveBeenCalledExactlyOnceWith('prueba-la-ceiba');
            expect(map.queryRenderedFeatures.mock.calls.at(-1)?.[1]).toEqual({ layers: ['restaurants-clusters', 'restaurants-points'] });
        });
    });

    describe('el elegido', () => {
        it('elegido desde la lista, la cámara va hasta él, lo bastante cerca para que no quede en un grupo', async () => {
            const { map, selected, slugsIn } = await mountLayer();

            selected.value = 'prueba-el-guadual';
            await flushPromises();

            expect(slugsIn('restaurants-selected')).toEqual(['prueba-el-guadual']);
            expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: EL_GUADUAL.coordinates, zoom: 16 });
            // Más cerca que el zoom hasta el que se agrupan.
            expect(map.getStyle().sources?.restaurants?.clusterMaxZoom).toBe(15);
        });

        it('al cerrar el resumen se quita el halo', async () => {
            const { selected, slugsIn } = await mountLayer();
            selected.value = 'prueba-la-ceiba';
            await flushPromises();

            selected.value = null;
            await flushPromises();

            expect(slugsIn('restaurants-selected')).toEqual([]);
        });

        it('tras tocar uno y cerrarlo, elegirlo desde la lista sí mueve la cámara', async () => {
            const { map, selected, tap } = await mountLayer();
            tap(LA_CEIBA);
            selected.value = 'prueba-la-ceiba';
            await flushPromises();
            selected.value = null;
            await flushPromises();

            selected.value = 'prueba-la-ceiba';
            await flushPromises();

            expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: LA_CEIBA.coordinates, zoom: 16 });
        });

        it('si la lista se vuelve a pedir (otro idioma), el elegido sigue con su halo y la cámara no se mueve otra vez', async () => {
            const { map, restaurants, selected, slugsIn } = await mountLayer();
            selected.value = 'prueba-la-ceiba';
            await flushPromises();

            restaurants.value = [restaurant({ categories: [{ slug: 'comida-tipica', name: 'Traditional food' }] }), EL_GUADUAL];
            await flushPromises();

            expect(slugsIn('restaurants-selected')).toEqual(['prueba-la-ceiba']);
            expect(map.easeTo).toHaveBeenCalledOnce();
        });

        it('un elegido que no está en la lista no deja halo ni mueve la cámara', async () => {
            const { map, selected, slugsIn } = await mountLayer();

            selected.value = 'no-existe';
            await flushPromises();

            expect(slugsIn('restaurants-selected')).toEqual([]);
            expect(map.easeTo).not.toHaveBeenCalled();
        });
    });

    describe('tema e idioma', () => {
        it('tras cambiar el tema, los restaurantes, el elegido y el ícono siguen en el mapa', async () => {
            const { map, selected, layerIds, slugsIn, toggleTheme } = await mountLayer();
            selected.value = 'prueba-la-ceiba';
            await flushPromises();

            await toggleTheme();
            await vi.waitFor(() => {
                expect(map.getStyle().name).toBe('https://tiles.example.test/style/veni-oscuro-es.json');
            });

            expect(layerIds().slice(2)).toEqual([
                'restaurants-selected',
                'restaurants-clusters',
                'restaurants-cluster-count',
                'restaurants-points',
                'restaurants-points-icon',
            ]);
            expect(slugsIn('restaurants')).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
            expect(slugsIn('restaurants-selected')).toEqual(['prueba-la-ceiba']);
            expect(map.imageIds()).toEqual(['restaurants-marker']);
        });

        it('y se pueden seguir tocando', async () => {
            const { map, onSelect, tap, toggleTheme } = await mountLayer();

            await toggleTheme();
            await vi.waitFor(() => {
                expect(map.getStyle().name).toBe('https://tiles.example.test/style/veni-oscuro-es.json');
            });
            tap(LA_CEIBA);

            expect(onSelect).toHaveBeenCalledExactlyOnceWith('prueba-la-ceiba');
        });
    });
});
