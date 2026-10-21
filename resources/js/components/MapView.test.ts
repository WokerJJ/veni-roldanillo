import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Component } from 'vue';
import { defineComponent, h } from 'vue';

import type { MapHandle } from '@/map/engine';
import type { MapGeoJson, MapLayerGroup } from '@/map/layers';
import type { MapLayers } from '@/map/useMapLayers';
import { removeGeolocation, stubGeolocation } from '@/testing/geolocation';
import type * as FakeInertia from '@/testing/inertia';
import type * as FakeMapLibre from '@/testing/maplibre';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
vi.mock('maplibre-gl', () => import('@/testing/maplibre'));
vi.mock('pmtiles', () => ({
    Protocol: class {
        tile = vi.fn();
    },
}));

const TEMPLATE = 'https://tiles.example.test/style/veni-{theme}-{locale}.json';
const CENTER = [-76.1547, 4.4128];
const BOUNDS = [-76.3, 4.3, -76, 4.55];
/** Otra esquina del pueblo, adonde quien usa el mapa lo pudo haber llevado. */
const ELSEWHERE: [number, number] = [-76.1493, 4.4172];
/** Cómo se le pide a MapLibre otro estilo: entero, y con las capas propias de vuelta adentro (ADR 0016). */
const FULL_SWAP = { diff: false, transformStyle: expect.any(Function) as unknown };

function styleUrl(theme: 'claro' | 'oscuro', locale: 'es' | 'en'): string {
    return `https://tiles.example.test/style/veni-${theme}-${locale}.json`;
}

/** Un estilo como los de veni-mapa; `name` dice de qué URL salió. */
function styleFrom(url: string) {
    return { version: 8, name: url, center: CENTER, zoom: 13.5, metadata: { 'veni:bounds': BOUNDS }, sources: {}, layers: [] };
}

interface PendingRequest {
    url: string;
    signal: AbortSignal | undefined;
    respond: (response?: { ok: boolean; status: number; body?: unknown }) => void;
}

/**
 * fetch de mentira para los estilos. Responde enseguida con el estilo de la
 * URL; con `hold()` deja las respuestas pendientes para que la prueba decida
 * cuándo y con qué llegan. Como el de verdad, rechaza al abortar la señal.
 */
function stubFetch() {
    const pending: PendingRequest[] = [];
    let holding = false;
    let failing: { ok: boolean; status: number } | null = null;

    const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((resolve, reject) => {
            const respond: PendingRequest['respond'] = (response = { ok: true, status: 200 }) => {
                resolve({
                    ok: response.ok,
                    status: response.status,
                    json: () => Promise.resolve(response.body ?? styleFrom(url)),
                });
            };

            init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('La petición se canceló.', 'AbortError'));
            });

            if (holding) {
                pending.push({ url, signal: init?.signal, respond });
            } else {
                respond(failing ?? undefined);
            }
        });
    });

    vi.stubGlobal('fetch', fetchMock);

    return {
        fetchMock,
        pending,
        urls: () => fetchMock.mock.calls.map(([url]) => url),
        hold: () => {
            holding = true;
        },
        fail: (status: number) => {
            failing = { ok: false, status };
        },
        recover: () => {
            failing = null;
        },
    };
}

function stubReducedMotion(reduce: boolean): void {
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: reduce && query === '(prefers-reduced-motion: reduce)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
}

/**
 * Copias nuevas del componente y del motor (el tema y el protocolo de PMTiles
 * son estado de módulo), con los dobles reiniciados y el tema que dejó el
 * script inline de app.blade.php. Junto al mapa va el botón de tema de la
 * cabecera: el mapa no trae el suyo.
 */
async function mountMap({
    theme = 'light',
    locale = 'es',
    mapError,
    attachTo,
    inside,
    overlay,
}: {
    theme?: 'light' | 'dark';
    locale?: 'es' | 'en';
    mapError?: Error;
    attachTo?: HTMLElement;
    /** Lo que la app pinta sobre el mapa: componentes dentro de <MapView>. */
    inside?: () => Component[];
    /** Lo que la página pone encima del mapa (su panel). */
    overlay?: HTMLElement;
} = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    const maplibre = (await import('maplibre-gl')) as unknown as typeof FakeMapLibre;
    inertia.reset();
    maplibre.reset();
    inertia.receiveFromServer(locale, { replace: true });
    document.documentElement.dataset.theme = theme;

    if (mapError) {
        maplibre.failNextMap(mapError);
    }

    const { default: MapView } = await import('./MapView.vue');
    const { default: ThemeToggle } = await import('./ThemeToggle.vue');
    const wrapper = mount(
        defineComponent({
            render: () => [h(ThemeToggle), h(MapView, overlay ? { overlay } : null, { default: () => (inside?.() ?? []).map((layer) => h(layer)) })],
        }),
        attachTo ? { attachTo } : {},
    );

    /**
     * El mapa creado (espera a que baje el motor y llegue el estilo). Con
     * plazo amplio: con la máquina cargada, el import() del motor tarda.
     */
    const map = async (index = 0) => {
        await vi.waitFor(
            () => {
                expect(maplibre.maps.length).toBeGreaterThan(index);
            },
            { timeout: 10_000 },
        );

        return maplibre.maps[index] as FakeMapLibre.Map;
    };

    return {
        wrapper,
        inertia,
        maplibre,
        map,
        /** El mapa ya pintado: MapLibre avisó «load». */
        loadedMap: async (index = 0) => {
            const created = await map(index);
            created.fire('load');
            await flushPromises();

            return created;
        },
        region: () => wrapper.get('section'),
        skeleton: () => wrapper.find('[role="status"]'),
        alert: () => wrapper.find('[role="alert"]'),
        toggleTheme: () => wrapper.get('button[aria-pressed]').trigger('click'),
    };
}

enableAutoUnmount(afterEach);

// La primera vez, Vite transforma el motor y todo lo que importa, y eso tarda
// más que las esperas de una prueba. Aquí, una vez y con su propio plazo: cada
// prueba vuelve a evaluarlo (vi.resetModules), pero ya transformado.
beforeAll(async () => {
    await import('@/map/engine');
}, 60_000);

let styles: ReturnType<typeof stubFetch>;

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    vi.stubEnv('VITE_MAP_STYLE_URL', TEMPLATE);
    stubReducedMotion(false);
    styles = stubFetch();
});

afterEach(async () => {
    vi.useRealTimers();
    // El motor llega con import() y hay pruebas que terminan antes que él: que
    // llegue dentro de la suya. En la siguiente volvería a darle a MapLibre la
    // URL del worker, y el orden de las pruebas cambiaría el resultado.
    await vi.dynamicImportSettled();
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.theme;
});

/** Lo que avisa MapLibre cuando abre la fuente de los tiles (llegó el índice del PMTiles). */
const SOURCE_OPENED = { dataType: 'source', sourceDataType: 'metadata', sourceId: 'protomaps' };
/** El plazo corre con un reloj de mentira; lo demás (import(), promesas) sigue su curso. */
function useFakeClock(): void {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

describe('MapView', () => {
    describe('carga', () => {
        it('es una región con nombre que muestra un esqueleto mientras carga', async () => {
            styles.hold();
            const { region, skeleton, alert, maplibre } = await mountMap();

            // El motor ya bajó y pidió el estilo, que todavía no llega.
            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(1);
            });

            expect(region().attributes('aria-label')).toBe('Mapa de Roldanillo');
            expect(region().attributes('aria-busy')).toBe('true');
            expect(skeleton().text()).toBe('Cargando el mapa…');
            expect(skeleton().classes()).toContain('motion-safe:animate-pulse');
            expect(alert().exists()).toBe(false);
            expect(maplibre.maps).toHaveLength(0);
        });

        it('crea el mapa con el estilo del tema y el idioma, y la cámara y los límites del estilo', async () => {
            const { map } = await mountMap();
            const created = await map();

            expect(styles.urls()).toEqual([styleUrl('claro', 'es')]);
            expect(created.options.style).toEqual(styleFrom(styleUrl('claro', 'es')));
            expect(created.options.center).toEqual(CENTER);
            expect(created.options.zoom).toBe(13.5);
            expect(created.options.maxBounds).toEqual(BOUNDS);
            expect(created.getCenter()).toEqual(CENTER);
            expect(created.getZoom()).toBe(13.5);
            expect(created.container.parentElement?.getAttribute('aria-label')).toBe('Mapa de Roldanillo');
        });

        it('el contenedor del mapa tiene alto propio: MapLibre le cambia la posición y sin él nacería con 300 px', async () => {
            const { map } = await mountMap();
            const created = await map();

            // maplibre-gl.css le pone `position: relative` al contenedor: con
            // solo `inset-0` mediría cero al crear el mapa (visto en Chrome).
            expect([...created.container.classList]).toEqual(expect.arrayContaining(['inset-0', 'size-full']));
        });

        it.each([
            ['light', 'en', styleUrl('claro', 'en')],
            ['dark', 'es', styleUrl('oscuro', 'es')],
            ['dark', 'en', styleUrl('oscuro', 'en')],
        ] as const)('con el tema %s y el idioma %s pide %s', async (theme, locale, url) => {
            const { map } = await mountMap({ theme, locale });
            await map();

            expect(styles.urls()).toEqual([url]);
        });

        it('al pintar quita el esqueleto y deja ver el mapa', async () => {
            const { map, region, skeleton } = await mountMap();
            const created = await map();

            expect(created.container.style.visibility).toBe('hidden');

            created.fire('load');
            await flushPromises();

            expect(region().attributes('aria-busy')).toBe('false');
            expect(skeleton().exists()).toBe(false);
            expect(created.container.style.visibility).toBe('');
            // La clase que MapLibre le puso al crearlo sigue: maplibre-gl.css cuelga de ella.
            expect(created.container.classList.contains('maplibregl-map')).toBe(true);
        });

        it('deja ver el mapa en cuanto abre la fuente de los tiles, sin esperar a que termine de cargar', async () => {
            const { map, region, skeleton } = await mountMap();
            const created = await map();

            // Llegó el índice del PMTiles: MapLibre ya pinta el fondo y va trayendo los tiles.
            created.fire('sourcedata', SOURCE_OPENED);
            await flushPromises();

            expect(skeleton().exists()).toBe(false);
            expect(region().attributes('aria-busy')).toBe('false');
            expect(created.container.style.visibility).toBe('');
        });

        it('otro aviso de la fuente (que empezó a pedirla) todavía no lo deja ver', async () => {
            const { map, skeleton } = await mountMap();
            const created = await map();

            created.fire('sourcedata', { dataType: 'source', sourceDataType: 'visibility', sourceId: 'protomaps' });
            await flushPromises();

            expect(skeleton().exists()).toBe(true);
            expect(created.container.style.visibility).toBe('hidden');
        });

        it('registra el protocolo de PMTiles y le da a MapLibre la URL de su worker', async () => {
            const { map, maplibre } = await mountMap();
            await map();

            expect(maplibre.addProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles', expect.any(Function));
            expect(maplibre.setWorkerUrl).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('maplibre-gl-worker'));
        });

        it('sin la cámara inicial en el estilo no crea el mapa', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.hold();
            const { alert, maplibre } = await mountMap();

            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(1);
            });
            styles.pending[0]?.respond({ ok: true, status: 200, body: { version: 8, sources: {}, layers: [] } });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });
            expect(maplibre.maps).toHaveLength(0);
            expect(maplibre.addProtocol).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledOnce();
        });

        // Sin la región, «¿Dónde estoy?» no podría avisar que alguien está
        // fuera de ella: mejor el error, que se ve, que un aviso que no llega.
        it.each([
            ['sin límites', undefined],
            ['con el oeste después del este', [-76.0, 4.3, -76.3, 4.55]],
            ['con el sur después del norte', [-76.3, 4.55, -76.0, 4.3]],
            ['fuera de rango', [-76.3, 4.3, -76.0, 95]],
        ])('%s en el estilo no crea el mapa', async (_case, bounds) => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.hold();
            const { alert, maplibre } = await mountMap();

            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(1);
            });
            const style = { ...styleFrom(TEMPLATE), metadata: bounds ? { 'veni:bounds': bounds } : {} };
            styles.pending[0]?.respond({ ok: true, status: 200, body: style });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });
            expect(maplibre.maps).toHaveLength(0);
            expect(error.mock.lastCall?.join(' ')).toMatch(/veni:bounds/);
        });
    });

    describe('controles', () => {
        it('trae los botones de zoom de MapLibre con sus textos en el idioma actual', async () => {
            const { loadedMap } = await mountMap();
            const created = await loadedMap();
            const zoomIn = created.container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-zoom-in');
            const zoomOut = created.container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-zoom-out');

            expect(zoomIn?.title).toBe('Acercar');
            expect(zoomIn?.getAttribute('aria-label')).toBe('Acercar');
            expect(zoomOut?.title).toBe('Alejar');
            expect(zoomOut?.getAttribute('aria-label')).toBe('Alejar');
            expect(created.getCanvas().getAttribute('aria-label')).toMatch(/^Mapa interactivo\./);
        });

        it('no trae brújula ni deja girar o inclinar el mapa', async () => {
            const { loadedMap } = await mountMap();
            const created = await loadedMap();

            expect(created.controls).toHaveLength(2);
            expect(created.controls[0]?.options).toEqual({ showCompass: false });
            expect(created.options).toMatchObject({ dragRotate: false, pitchWithRotate: false, touchPitch: false });
            expect(created.touchZoomRotate.disableRotation).toHaveBeenCalledOnce();
            expect(created.keyboard.disableRotation).toHaveBeenCalledOnce();
        });

        it('deja la atribución de OpenStreetMap siempre desplegada', async () => {
            const { map } = await mountMap();

            expect((await map()).options.attributionControl).toEqual({ compact: false });
        });

        it('no agrega botones de tema ni de idioma dentro del mapa', async () => {
            const { loadedMap, region } = await mountMap();
            await loadedMap();

            // Los únicos botones de la región son los de MapLibre: zoom y ubicación.
            expect(region().findAll('button').map((button) => button.attributes('title'))).toEqual(['Acercar', 'Alejar', '¿Dónde estoy?']);
        });
    });

    describe('¿Dónde estoy?', () => {
        /** La plaza de Roldanillo: dentro de la región del mapa. */
        const PLAZA = { longitude: -76.1547, latitude: 4.4128 };

        /** El botón, ya armado: MapLibre termina de prepararlo después de preguntar (sin pedirlo) por el permiso. */
        async function locateButton(map: FakeMapLibre.Map): Promise<HTMLButtonElement> {
            await flushPromises();
            const button = map.container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate');

            if (!button) {
                throw new Error('No está el botón «¿Dónde estoy?».');
            }

            return button;
        }

        function userDot(map: FakeMapLibre.Map): HTMLElement | null {
            return map.container.querySelector('.maplibregl-user-location-dot');
        }

        /*
        | La ruta de «Cómo llegar» (#11, ADR 0020) recibe la ubicación dentro
        | del motor, por una suscripción en memoria.
        */
        describe('la ubicación para la ruta', () => {
            /** Un componente dentro de <MapView> que se queda con el mapa, como la capa de la ruta. */
            async function withHandle() {
                const { useMap } = await import('@/map/useMapLayers');
                const holder: { map: MapHandle | null } = { map: null };
                const Grabber: Component = {
                    setup() {
                        const { map } = useMap();

                        return () => {
                            holder.map = map.value;

                            return null;
                        };
                    },
                };

                return { Grabber, holder };
            }

            it('requestPosition enciende el control como un toque y la posición llega a quien se suscribió', async () => {
                const device = stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const created = await loadedMap();
                const button = await locateButton(created);
                const events: unknown[] = [];

                const stop = holder.map?.watchPosition((event) => events.push(event));
                holder.map?.requestPosition();
                device.move(PLAZA);

                expect(button.getAttribute('aria-pressed')).toBe('true');
                expect(events).toEqual([{ type: 'position', at: [PLAZA.longitude, PLAZA.latitude] }]);

                // Encendido, pedirla otra vez no lo apaga.
                holder.map?.requestPosition();
                expect(button.getAttribute('aria-pressed')).toBe('true');

                stop?.();
                device.move({ longitude: -76.15, latitude: 4.41 });
                expect(events).toHaveLength(1);
            });

            it('quien se suscribe con la ubicación ya en el mapa la recibe enseguida', async () => {
                const device = stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const button = await locateButton(await loadedMap());
                button.click();
                device.move(PLAZA);
                const events: unknown[] = [];

                holder.map?.watchPosition((event) => events.push(event));

                expect(events).toEqual([{ type: 'position', at: [PLAZA.longitude, PLAZA.latitude] }]);
            });

            it('avisa los problemas, y que se apagó', async () => {
                const device = stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const button = await locateButton(await loadedMap());
                const events: unknown[] = [];
                holder.map?.watchPosition((event) => events.push(event));

                holder.map?.requestPosition();
                device.move({ longitude: -74.0721, latitude: 4.711 });
                device.move(PLAZA);
                // Dos toques: el primero vuelve a centrar, el segundo lo apaga.
                button.click();
                button.click();
                await flushPromises();

                expect(events).toEqual([
                    { type: 'problem', problem: 'outside' },
                    { type: 'position', at: [PLAZA.longitude, PLAZA.latitude] },
                    { type: 'off' },
                ]);
            });

            it('con el permiso negado avisa el problema, sin un «apagado» después', async () => {
                const device = stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                await locateButton(await loadedMap());
                const events: unknown[] = [];
                holder.map?.watchPosition((event) => events.push(event));

                holder.map?.requestPosition();
                device.fail(1);
                await flushPromises();

                expect(events).toEqual([{ type: 'problem', problem: 'denied' }]);
            });

            it('showBounds encuadra la región en lo que el panel deja a la vista, con margen', async () => {
                stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const created = await loadedMap();
                vi.spyOn(created.container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 700));

                holder.map?.showBounds([-76.16, 4.41, -76.15, 4.42]);

                // A la derecha, además, la columna de los botones del mapa (10 px de margen y 44 del botón).
                expect(created.fitBounds).toHaveBeenCalledWith([-76.16, 4.41, -76.15, 4.42], { padding: { top: 48, right: 102, bottom: 48, left: 48 }, maxZoom: 17 });
            });

            it('showBounds con el panel alto en un celular achica los márgenes, sin dejar sin lugar lo que encuadra', async () => {
                stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const overlay = document.createElement('div');
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const created = await loadedMap();
                vi.spyOn(created.container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 700));
                // El panel, abajo, deja 140 px de mapa a la vista.
                vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 140, 366, 560));
                holder.map?.setOverlay(overlay);

                holder.map?.showBounds([-76.16, 4.41, -76.15, 4.42]);

                expect(created.fitBounds).toHaveBeenCalledWith([-76.16, 4.41, -76.15, 4.42], { padding: { top: 48, right: 102, bottom: 608, left: 48 }, maxZoom: 17 });
            });

            it('showBounds en un mapa angosto achica también la columna de los botones', async () => {
                stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const created = await loadedMap();
                vi.spyOn(created.container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 700));

                holder.map?.showBounds([-76.16, 4.41, -76.15, 4.42]);

                const padding = (created.fitBounds.mock.calls[0]?.[1] as { padding: { left: number; right: number } }).padding;
                expect(120 - padding.left - padding.right).toBeGreaterThanOrEqual(44);
            });

            it('showBounds deja de seguir la ubicación: la siguiente lectura no mueve la cámara', async () => {
                const device = stubGeolocation();
                const { Grabber, holder } = await withHandle();
                const { loadedMap } = await mountMap({ inside: () => [Grabber] });
                const created = await loadedMap();
                const button = await locateButton(created);
                const events: unknown[] = [];
                holder.map?.watchPosition((event) => events.push(event));
                holder.map?.requestPosition();
                device.move(PLAZA);

                holder.map?.showBounds([-76.16, 4.41, -76.15, 4.42]);
                created.fitBounds.mockClear();
                created.easeTo.mockClear();
                created.jumpTo.mockClear();
                const center = created.getCenter();
                device.move({ longitude: -76.1545, latitude: 4.4126 });

                expect(created.fitBounds).not.toHaveBeenCalled();
                expect(created.easeTo).not.toHaveBeenCalled();
                expect(created.jumpTo).not.toHaveBeenCalled();
                expect(created.getCenter()).toEqual(center);
                // Sigue encendido, en segundo plano: la ruta recibe la posición.
                expect(button.getAttribute('aria-pressed')).toBe('true');
                expect(button.classList.contains('maplibregl-ctrl-geolocate-background')).toBe(true);
                expect(events).toHaveLength(2);
            });
        });

        it('es el control de geolocalización de MapLibre, debajo de los de zoom, con su nombre en el idioma actual', async () => {
            stubGeolocation();
            const { loadedMap, maplibre } = await mountMap();
            const created = await loadedMap();
            const button = await locateButton(created);

            expect(created.controls[1]).toBeInstanceOf(maplibre.GeolocateControl);
            expect(created.controls[1]?.options).toMatchObject({
                trackUserLocation: true,
                showUserLocation: true,
                showAccuracyCircle: true,
                positionOptions: { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
                fitBoundsOptions: { maxZoom: 16 },
            });
            // MapLibre le pone «Find my location» al terminar de armarlo: queda el de la app.
            expect(button.title).toBe('¿Dónde estoy?');
            expect(button.getAttribute('aria-label')).toBe('¿Dónde estoy?');
            expect(button.disabled).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');
        });

        it('lleva el ícono de ubicación de la app, decorativo y del color del botón', async () => {
            stubGeolocation();
            const { loadedMap } = await mountMap();
            const button = await locateButton(await loadedMap());
            const icon = button.querySelector('svg');

            expect(button.children).toHaveLength(1);
            expect(icon?.getAttribute('class')).toBe('veni-ctrl-icon');
            expect(icon?.getAttribute('aria-hidden')).toBe('true');
            expect(icon?.getAttribute('stroke')).toBe('currentColor');
            // El tamaño lo pone map.css.
            expect(icon?.hasAttribute('width')).toBe(false);
            expect(icon?.querySelector('path')).not.toBeNull();
        });

        it('no pide la ubicación al cargar el mapa: solo al tocar el botón', async () => {
            const device = stubGeolocation();
            const { loadedMap } = await mountMap();
            const button = await locateButton(await loadedMap());

            expect(device.geolocation.watchPosition).not.toHaveBeenCalled();
            expect(device.geolocation.getCurrentPosition).not.toHaveBeenCalled();

            button.click();

            expect(device.geolocation.watchPosition).toHaveBeenCalledOnce();
            expect(device.lastOptions()).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
        });

        it('con la ubicación, la marca en el mapa y la cámara va hasta ella', async () => {
            const device = stubGeolocation();
            const { loadedMap } = await mountMap();
            const created = await loadedMap();
            const button = await locateButton(created);

            button.click();
            device.move(PLAZA);

            expect(userDot(created)?.dataset.lngLat).toBe('-76.1547,4.4128');
            expect(created.container.querySelector('.maplibregl-user-location-accuracy-circle')).not.toBeNull();
            expect(created.fitBounds).toHaveBeenCalledOnce();
            expect(created.fitBounds.mock.calls[0]?.[1]).toMatchObject({ maxZoom: 16 });
            expect(button.getAttribute('aria-pressed')).toBe('true');
            expect(button.classList.contains('maplibregl-ctrl-geolocate-active')).toBe(true);
        });

        it('mientras está encendido, la marca y la cámara siguen a quien camina', async () => {
            const device = stubGeolocation();
            const { loadedMap } = await mountMap();
            const created = await loadedMap();
            const button = await locateButton(created);

            button.click();
            device.move(PLAZA);
            device.move({ longitude: ELSEWHERE[0], latitude: ELSEWHERE[1] });

            expect(userDot(created)?.dataset.lngLat).toBe(ELSEWHERE.join(','));
            expect(created.fitBounds).toHaveBeenCalledTimes(2);
        });

        it('tocarlo otra vez lo apaga: deja de pedir la ubicación y la quita del mapa', async () => {
            const device = stubGeolocation();
            const { loadedMap } = await mountMap();
            const created = await loadedMap();
            const button = await locateButton(created);

            button.click();
            device.move(PLAZA);
            button.click();

            expect(device.geolocation.clearWatch).toHaveBeenCalledOnce();
            expect(device.watching()).toBe(0);
            expect(userDot(created)).toBeNull();
            expect(button.getAttribute('aria-pressed')).toBe('false');
        });

        it('al cambiar el tema o el idioma sigue encendido y con la marca; el botón cambia de nombre', async () => {
            const device = stubGeolocation();
            const { loadedMap, toggleTheme, inertia } = await mountMap();
            const created = await loadedMap();
            const button = await locateButton(created);

            button.click();
            device.move(PLAZA);

            await toggleTheme();
            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledTimes(2);
            });
            await flushPromises();

            expect(button.title).toBe('Where am I?');
            expect(button.getAttribute('aria-label')).toBe('Where am I?');
            expect(button.getAttribute('aria-pressed')).toBe('true');
            expect(userDot(created)?.dataset.lngLat).toBe('-76.1547,4.4128');
            expect(device.watching()).toBe(1);
        });

        it('al salir de la página deja de pedir la ubicación', async () => {
            const device = stubGeolocation();
            const { loadedMap, wrapper } = await mountMap();
            const button = await locateButton(await loadedMap());

            button.click();
            wrapper.unmount();

            expect(device.geolocation.clearWatch).toHaveBeenCalledOnce();
            expect(device.watching()).toBe(0);
        });

        describe('avisos', () => {
            /** Bogotá: fuera de la región del mapa. */
            const BOGOTA = { longitude: -74.0721, latitude: 4.711 };

            /** El mapa a la vista, en la página (para el foco), con «¿Dónde estoy?» ya tocado. */
            async function locating(options: { locale?: 'es' | 'en'; permission?: PermissionState } = {}) {
                const device = stubGeolocation(options);
                const host = document.createElement('div');
                document.body.append(host);
                onTestFinished(() => {
                    host.remove();
                });
                const mounted = await mountMap({ ...options, attachTo: host });
                const created = await mounted.loadedMap();
                const button = await locateButton(created);

                button.focus();
                button.click();

                const update = async (): Promise<void> => {
                    await flushPromises();
                };

                return {
                    ...mounted,
                    device,
                    created,
                    button,
                    /** El botón de ahora: con el permiso negado, MapLibre se queda con un control nuevo. */
                    current: () => created.container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate'),
                    update,
                    live: () => mounted.region().get('[aria-live="polite"]'),
                };
            }

            it.each([
                ['es', 'No tenemos permiso para ver tu ubicación. Tocá otra vez «¿Dónde estoy?» y elegí «Permitir».'],
                ['en', 'We don\'t have permission to see your location. Tap “Where am I?” again and choose “Allow”.'],
            ] as const)('sin permiso (%s) dice cómo darlo, sin deshabilitar el botón ni sacarle el foco', async (locale, text) => {
                const { device, current, alert, update, region } = await locating({ locale });

                device.fail(1);
                await update();
                const button = current();

                expect(alert().text()).toContain(text);
                expect(alert().text()).toMatch(locale === 'es' ? /ajustes del teléfono/ : /phone's settings/);
                // El aviso va sobre el mapa, no lo reemplaza: el mapa se sigue usando.
                expect(region().attributes('aria-busy')).toBe('false');
                expect(button?.disabled).toBe(false);
                expect(button?.title).toBe(locale === 'es' ? '¿Dónde estoy?' : 'Where am I?');
                expect(document.activeElement).toBe(button);
                expect(device.watching()).toBe(0);
            });

            it('con el permiso ya negado al cargar, el botón no queda deshabilitado: tocarlo lo explica', async () => {
                const device = stubGeolocation({ permission: 'denied' });
                const { loadedMap, alert } = await mountMap();
                const button = await locateButton(await loadedMap());

                // MapLibre lo deshabilitó al prepararlo, con «Location not available».
                expect(button.disabled).toBe(false);
                expect(button.title).toBe('¿Dónde estoy?');

                button.click();
                device.fail(1);
                await flushPromises();

                expect(alert().text()).toContain('No tenemos permiso');
            });

            it.each([
                ['al tocarlo', false],
                ['mientras la sigue', true],
            ] as const)('tras negar el permiso (%s), tocar otra vez la pide como la primera: precisión alta y 10 s por lectura', async (_when, tracking) => {
                const { device, created, alert, update } = await locating();

                if (tracking) {
                    device.move(PLAZA);
                }

                device.fail(1);
                await update();
                const button = await locateButton(created);

                // El botón es otro, pero el foco no se perdió.
                expect(document.activeElement).toBe(button);

                device.geolocation.watchPosition.mockClear();
                button.click();

                expect(device.geolocation.watchPosition).toHaveBeenCalledOnce();
                expect(device.lastOptions()).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });

                // Y con el tiempo agotado vuelve a avisar.
                device.fail(3);
                await update();

                expect(alert().text()).toContain('Todavía no sabemos dónde estás');
            });

            it('sin señal o con el tiempo agotado avisa una vez y sigue buscando; al llegar la ubicación, el aviso se va', async () => {
                const { device, button, alert, update, live, wrapper } = await locating();

                device.fail(3);
                await update();

                expect(alert().text()).toContain('Todavía no sabemos dónde estás');
                expect(alert().text()).toContain('Seguimos buscando');
                expect(device.watching()).toBe(1);

                // Cerrado, no vuelve con cada lectura que falla.
                await wrapper.get('[role="alert"] button').trigger('click');
                device.fail(3);
                device.fail(2);
                await update();

                expect(alert().exists()).toBe(false);
                expect(document.activeElement).toBe(button);

                device.move(PLAZA);
                await update();

                expect(alert().exists()).toBe(false);
                expect(live().text()).toBe('Listo: tu ubicación está en el mapa.');
            });

            it('fuera de la región del mapa avisa que solo cubre Roldanillo, sin marca ni cámara', async () => {
                const { device, created, alert, update, live } = await locating();

                device.move(BOGOTA);
                await update();

                expect(alert().text()).toBe(
                    'Estás fuera de la zona del mapa: solo cubre Roldanillo y sus alrededores. Cuando estés por acá, te mostramos en el mapa.',
                );
                expect(userDot(created)).toBeNull();
                expect(created.fitBounds).not.toHaveBeenCalled();
                expect(live().text()).toBe('');
            });

            it('en un navegador sin geolocalización, tocar el botón lo explica', async () => {
                removeGeolocation();
                const { loadedMap, alert } = await mountMap({ locale: 'en' });
                const button = await locateButton(await loadedMap());

                expect(button.disabled).toBe(false);

                button.click();
                await flushPromises();

                expect(alert().text()).toBe('This browser can\'t share your location. Try opening Vení in another browser.');
            });

            it('se cierra con su botón, que tiene nombre, y el foco vuelve a «¿Dónde estoy?»', async () => {
                const { device, current, alert, update, wrapper } = await locating({ locale: 'en' });

                device.fail(1);
                await update();
                const close = wrapper.get('[role="alert"] button');

                expect(close.attributes('aria-label')).toBe('Close the notice');

                (close.element as HTMLButtonElement).focus();
                await close.trigger('click');

                expect(alert().exists()).toBe(false);
                expect(document.activeElement).toBe(current());
            });

            it('Escape lo cierra y no le llega a la página', async () => {
                const { device, current, alert, update, wrapper } = await locating();

                device.fail(1);
                await update();
                const close = wrapper.get('[role="alert"] button').element as HTMLButtonElement;
                close.focus();
                const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
                close.dispatchEvent(escape);
                await update();

                expect(escape.defaultPrevented).toBe(true);
                expect(alert().exists()).toBe(false);
                expect(document.activeElement).toBe(current());
            });

            it('tocar otra vez el botón quita el aviso: es otro intento', async () => {
                const { device, current, alert, update } = await locating();

                device.fail(1);
                await update();
                current()?.click();
                await update();

                expect(alert().exists()).toBe(false);
                expect(device.watching()).toBe(1);
            });

            it('si llega la ubicación con el foco en el aviso, el foco pasa al botón', async () => {
                const { device, button, alert, update, wrapper } = await locating();

                device.fail(3);
                await update();
                (wrapper.get('[role="alert"] button').element as HTMLButtonElement).focus();
                device.move(PLAZA);
                await update();

                expect(alert().exists()).toBe(false);
                expect(document.activeElement).toBe(button);
            });

            it('apagarlo deja de anunciar la ubicación', async () => {
                const { device, button, update, live } = await locating({ locale: 'en' });

                device.move(PLAZA);
                await update();

                expect(live().text()).toBe('Done: your location is on the map.');

                button.click();
                await update();

                expect(live().text()).toBe('');
            });
        });

        describe('la cámara y el panel de la página', () => {
            /** El mapa del inicio en un celular, bajo la cabecera, y el panel abajo, a lo ancho. */
            const PHONE_MAP = new DOMRect(0, 64, 390, 780);
            const SHEET = new DOMRect(12, 520, 366, 288);

            function placeAt(element: Element, box: DOMRect): void {
                vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(box);
            }

            /** Un ResizeObserver al que la prueba le dice cuándo cambió algo de tamaño. */
            function stubResizeObserver() {
                const observers: { callback: () => void; targets: Element[] }[] = [];

                vi.stubGlobal(
                    'ResizeObserver',
                    class {
                        private readonly entry: { callback: () => void; targets: Element[] };

                        constructor(callback: () => void) {
                            this.entry = { callback, targets: [] };
                            observers.push(this.entry);
                        }

                        observe(target: Element): void {
                            this.entry.targets.push(target);
                        }

                        disconnect(): void {
                            this.entry.targets = [];
                        }
                    },
                );

                return {
                    /** Cambió de tamaño `target`: avisa a quienes lo miran. */
                    resize(target: Element): void {
                        for (const { callback, targets } of observers) {
                            if (targets.includes(target)) {
                                callback();
                            }
                        }
                    },
                };
            }

            /** El margen con que MapLibre encuadró la ubicación la última vez. */
            function lastPadding(map: FakeMapLibre.Map): unknown {
                return map.fitBounds.mock.lastCall?.[1]?.padding;
            }

            it('al ubicarse, la cámara deja la ubicación en lo que el panel deja a la vista', async () => {
                const device = stubGeolocation();
                const panel = document.createElement('section');
                const { loadedMap } = await mountMap({ overlay: panel });
                const created = await loadedMap();
                const button = await locateButton(created);
                placeAt(created.container, PHONE_MAP);
                placeAt(panel, SHEET);

                button.click();
                device.move(PLAZA);

                expect(created.fitBounds.mock.lastCall?.[1]).toMatchObject({ maxZoom: 16 });
                expect(lastPadding(created)).toEqual({ top: 0, right: 0, bottom: 324, left: 0 });
            });

            it('un punto que se muestra queda en el centro de lo que el panel deja a la vista, sin dejarle un margen puesto a la cámara', async () => {
                const { useMap } = await import('@/map/useMapLayers');
                const used: { map?: ReturnType<typeof useMap>['map'] } = {};
                const Camera: Component = {
                    setup() {
                        used.map = useMap().map;

                        return () => null;
                    },
                };
                const panel = document.createElement('section');
                const { loadedMap } = await mountMap({ overlay: panel, inside: () => [Camera] });
                const created = await loadedMap();
                placeAt(created.container, PHONE_MAP);
                placeAt(panel, SHEET);

                used.map?.value?.showPoint(ELSEWHERE, { minZoom: 16 });

                // El panel de abajo tapa 324 px: el punto sube la mitad.
                expect(created.easeTo).toHaveBeenLastCalledWith({ center: ELSEWHERE, zoom: 16, offset: [0, -162] });
            });

            it('con `ifHidden`, solo mueve la cámara si el punto queda debajo del panel o fuera de lo que se ve', async () => {
                const { useMap } = await import('@/map/useMapLayers');
                const used: { map?: ReturnType<typeof useMap>['map'] } = {};
                const Camera: Component = {
                    setup() {
                        used.map = useMap().map;

                        return () => null;
                    },
                };
                const panel = document.createElement('section');
                const { loadedMap } = await mountMap({ overlay: panel, inside: () => [Camera] });
                const created = await loadedMap();
                placeAt(created.container, PHONE_MAP);
                placeAt(panel, SHEET);
                const project = vi.spyOn(created, 'project');

                // Arriba del panel, a la vista: la cámara se queda.
                project.mockReturnValue({ x: 195, y: 200 });
                used.map?.value?.showPoint(ELSEWHERE, { ifHidden: true });
                expect(created.easeTo).not.toHaveBeenCalled();

                // Debajo del panel (que tapa de 456 px para abajo): lo sube al centro de lo que queda.
                project.mockReturnValue({ x: 195, y: 600 });
                used.map?.value?.showPoint(ELSEWHERE, { ifHidden: true });
                expect(created.easeTo).toHaveBeenLastCalledWith({ center: ELSEWHERE, zoom: created.getZoom(), offset: [0, -162] });

                // Pegado al borde de arriba: tampoco se ve bien.
                project.mockReturnValue({ x: 195, y: 4 });
                used.map?.value?.showPoint(ELSEWHERE, { ifHidden: true });
                expect(created.easeTo).toHaveBeenCalledTimes(2);
            });

            it('si el panel cambia de tamaño mientras la sigue, la siguiente posición ya lo tiene en cuenta', async () => {
                const device = stubGeolocation();
                const sizes = stubResizeObserver();
                const panel = document.createElement('section');
                const { loadedMap } = await mountMap({ overlay: panel });
                const created = await loadedMap();
                const button = await locateButton(created);
                placeAt(created.container, PHONE_MAP);
                placeAt(panel, SHEET);

                button.click();
                device.move(PLAZA);

                // Se abre la lista: el panel crece hasta 10rem del borde de arriba.
                placeAt(panel, new DOMRect(12, 224, 366, 584));
                sizes.resize(panel);
                device.move({ longitude: ELSEWHERE[0], latitude: ELSEWHERE[1] });

                expect(lastPadding(created)).toEqual({ top: 0, right: 0, bottom: 620, left: 0 });
            });

            it('sin panel encima, sin margen', async () => {
                const device = stubGeolocation();
                const { loadedMap } = await mountMap();
                const created = await loadedMap();
                const button = await locateButton(created);

                button.click();
                device.move(PLAZA);

                expect(lastPadding(created)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
            });

            it('elegir un restaurante mientras sigue la ubicación: la cámara se queda en el restaurante', async () => {
                const device = stubGeolocation();
                const { useMap } = await import('@/map/useMapLayers');
                const used: { map?: ReturnType<typeof useMap>['map'] } = {};
                const Selection: Component = {
                    setup() {
                        used.map = useMap().map;

                        return () => null;
                    },
                };
                const { loadedMap } = await mountMap({ inside: () => [Selection] });
                const created = await loadedMap();
                const button = await locateButton(created);

                button.click();
                device.move(PLAZA);
                // Como RestaurantsLayer al elegir uno (también desde ?r=slug).
                used.map?.value?.showPoint(ELSEWHERE, { minZoom: 16 });
                device.move({ longitude: -76.1551, latitude: 4.4131 });

                expect(created.fitBounds).toHaveBeenCalledOnce();
                expect(created.getCenter()).toEqual(ELSEWHERE);
                // La marca sí sigue a quien camina; el botón, encendido, dice que la cámara ya no la sigue.
                expect(userDot(created)?.dataset.lngLat).toBe('-76.1551,4.4131');
                expect(button.classList.contains('maplibregl-ctrl-geolocate-background')).toBe(true);
                expect(button.getAttribute('aria-pressed')).toBe('true');

                // Tocarlo otra vez vuelve a llevar la cámara a la ubicación.
                button.click();

                expect(created.fitBounds).toHaveBeenCalledTimes(2);
            });
        });

        /*
        | Regla 3 de producto y ADR 0008: la posición se usa en el dispositivo
        | y no sale de él. Lo que estas pruebas no ven (MapLibre de verdad, el
        | service worker) lo cubre la verificación en un navegador real.
        */
        describe('la posición no sale del dispositivo', () => {
            /** Una posición con cifras que no aparecen en ningún otro lado. */
            const SECRET = { longitude: -76.1561937, latitude: 4.4093771 };
            const SECRET_TRACE = /76\.15619|4\.40937|4,40937|76,15619/;

            function leaks(value: unknown): boolean {
                return SECRET_TRACE.test(typeof value === 'string' ? value : JSON.stringify(value));
            }

            function storageText(storage: Storage): string {
                return Array.from({ length: storage.length }, (_, index) => {
                    const key = storage.key(index) ?? '';

                    return `${key}=${storage.getItem(key) ?? ''}`;
                }).join('\n');
            }

            it('ni a la red, ni a la dirección, ni al almacenamiento del navegador', async () => {
                const device = stubGeolocation();
                // Lo que happy-dom no trae (o no deja espiar), de mentira: las
                // cachés y la base de datos del navegador, el service worker y
                // los WebSocket. Nada tiene que tocarlos.
                const cache = { open: vi.fn(), match: vi.fn(), has: vi.fn(), delete: vi.fn(), keys: vi.fn() };
                const database = { open: vi.fn(), deleteDatabase: vi.fn() };
                const worker = { postMessage: vi.fn() };
                const socket = vi.fn();
                vi.stubGlobal('caches', cache);
                vi.stubGlobal('indexedDB', database);
                vi.stubGlobal('WebSocket', socket);
                Object.defineProperty(navigator, 'serviceWorker', {
                    value: { controller: worker, ready: Promise.resolve({ active: worker }) },
                    configurable: true,
                });
                onTestFinished(() => {
                    Reflect.deleteProperty(navigator, 'serviceWorker');
                });
                const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
                const send = vi.spyOn(XMLHttpRequest.prototype, 'send');
                const beacon = vi.spyOn(navigator, 'sendBeacon');
                const pushState = vi.spyOn(window.history, 'pushState');
                const replaceState = vi.spyOn(window.history, 'replaceState');
                const { loadedMap, toggleTheme, inertia, region } = await mountMap();
                const created = await loadedMap();
                const button = await locateButton(created);
                const href = window.location.href;

                button.click();
                device.move(SECRET);
                device.move({ ...SECRET, accuracy: 5 });

                // La posición sí llegó al mapa: la prueba no mira un mapa vacío.
                expect(leaks(userDot(created)?.dataset.lngLat)).toBe(true);
                expect(created.fitBounds).toHaveBeenCalledTimes(2);

                // Y un aviso: dice qué pasó, nunca dónde.
                device.move({ longitude: -74.0721937, latitude: 4.7109377 });
                // Con la ubicación en el mapa, otro tema y otro idioma: piden estilos nuevos a la red.
                await toggleTheme();
                inertia.receiveFromServer('en', { replace: true });
                await vi.waitFor(() => {
                    expect(created.setStyle).toHaveBeenCalledTimes(2);
                });
                await flushPromises();

                expect(styles.fetchMock).toHaveBeenCalledTimes(3);
                expect(styles.fetchMock.mock.calls.filter((call) => leaks(call))).toEqual([]);
                expect(open).not.toHaveBeenCalled();
                expect(send).not.toHaveBeenCalled();
                expect(beacon).not.toHaveBeenCalled();
                expect(leaks(Object.values(inertia.router).map((method) => (vi.isMockFunction(method) ? method.mock.calls : [])))).toBe(false);

                expect(window.location.href).toBe(href);
                expect(window.location.hash).toBe('');
                expect(pushState).not.toHaveBeenCalled();
                expect(replaceState).not.toHaveBeenCalled();

                expect(leaks(storageText(window.localStorage))).toBe(false);
                expect(leaks(storageText(window.sessionStorage))).toBe(false);
                expect(leaks(document.cookie)).toBe(false);
                expect([...Object.values(cache), ...Object.values(database), worker.postMessage, socket].filter((spy) => spy.mock.calls.length > 0)).toEqual([]);
                // Tras cambiar de idioma, el aviso sigue a la vista, en inglés.
                expect(region().get('[role="alert"]').text()).toContain("You're outside the map's area");
                expect(region().text()).not.toMatch(/74\.07|4\.71|76\.15|4\.40/);
            });

            it('la cámara, que sigue a la ubicación, no se escribe en la dirección', async () => {
                const { map } = await mountMap();

                // El `hash` de MapLibre pondría centro y zoom en la URL (#zoom/lat/lng).
                expect((await map()).options.hash ?? false).toBe(false);
            });
        });
    });

    describe('tema e idioma', () => {
        it('al cambiar el tema cambia el estilo en el mismo mapa, sin mover la cámara', async () => {
            const { loadedMap, toggleTheme, maplibre } = await mountMap();
            const created = await loadedMap();

            // Quien usa el mapa se fue a otra esquina del pueblo y se acercó.
            created.userMovesTo({ center: ELSEWHERE, zoom: 16 });

            await toggleTheme();
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledOnce();
            });

            expect(styles.urls()).toEqual([styleUrl('claro', 'es'), styleUrl('oscuro', 'es')]);
            expect(created.setStyle).toHaveBeenCalledWith(styleFrom(styleUrl('oscuro', 'es')), FULL_SWAP);
            expect(maplibre.maps).toHaveLength(1);
            expect(created.remove).not.toHaveBeenCalled();

            // El estilo nuevo trae el centro del pueblo: la cámara sigue donde la dejaron.
            expect(created.getCenter()).toEqual(ELSEWHERE);
            expect(created.getZoom()).toBe(16);

            for (const move of [created.jumpTo, created.easeTo, created.flyTo, created.setCenter, created.setZoom, created.fitBounds]) {
                expect(move).not.toHaveBeenCalled();
            }
        });

        it('al cambiar el idioma cambia el estilo y los textos de los controles, sin mover la cámara', async () => {
            const { loadedMap, inertia, maplibre, region } = await mountMap();
            const created = await loadedMap();

            created.userMovesTo({ center: ELSEWHERE, zoom: 16 });

            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledOnce();
            });

            expect(created.setStyle).toHaveBeenCalledWith(styleFrom(styleUrl('claro', 'en')), FULL_SWAP);
            expect(maplibre.maps).toHaveLength(1);
            expect(created.jumpTo).not.toHaveBeenCalled();
            expect(created.getCenter()).toEqual(ELSEWHERE);
            expect(created.getZoom()).toBe(16);
            expect(region().attributes('aria-label')).toBe('Map of Roldanillo');
            expect([...created.container.querySelectorAll('button')].map((button) => button.title)).toEqual(['Zoom in', 'Zoom out', 'Where am I?']);
            expect([...created.container.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual([
                'Zoom in',
                'Zoom out',
                'Where am I?',
            ]);
            expect(created.getCanvas().getAttribute('aria-label')).toMatch(/^Interactive map\./);
        });

        it('con cambios seguidos solo aplica el último estilo pedido', async () => {
            const { loadedMap, toggleTheme, inertia } = await mountMap();
            const created = await loadedMap();

            styles.hold();
            await toggleTheme();
            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(styles.pending.map((request) => request.url)).toEqual([styleUrl('oscuro', 'es'), styleUrl('oscuro', 'en')]);
            });

            // Llegan al revés: el primero que se pidió, de último.
            styles.pending[1]?.respond();
            styles.pending[0]?.respond();
            await flushPromises();

            expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'en')), FULL_SWAP);
        });

        it('si el tema cambia mientras el mapa carga, al pintar se pone al día', async () => {
            const { map, toggleTheme } = await mountMap();
            const created = await map();

            await toggleTheme();
            expect(created.setStyle).not.toHaveBeenCalled();

            created.fire('load');
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'es')), FULL_SWAP);
            });
        });

        it('con el mapa a la vista y todavía cargando, el cambio de tema se aplica sin esperar', async () => {
            const { map, toggleTheme } = await mountMap();
            const created = await map();

            created.fire('sourcedata', SOURCE_OPENED);
            await flushPromises();
            await toggleTheme();

            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'es')), FULL_SWAP);
            });
        });

        it('si el estilo nuevo no llega, el mapa sigue con el anterior', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { loadedMap, toggleTheme, alert, region } = await mountMap();
            const created = await loadedMap();

            styles.fail(503);
            await toggleTheme();
            await vi.waitFor(() => {
                expect(error).toHaveBeenCalledOnce();
            });

            expect(created.setStyle).not.toHaveBeenCalled();
            expect(created.remove).not.toHaveBeenCalled();
            expect(alert().exists()).toBe(false);
            expect(region().attributes('aria-busy')).toBe('false');
        });

        it.each([
            ['vuelve la conexión', (): void => void window.dispatchEvent(new Event('online'))],
            [
                'el navegador recupera el contexto de WebGL',
                (created: FakeMapLibre.Map): void => {
                    created.fire('webglcontextrestored');
                },
            ],
        ] as const)('si el estilo nuevo no llegó, lo vuelve a pedir cuando %s', async (_when, happen) => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { loadedMap, toggleTheme } = await mountMap();
            const created = await loadedMap();

            styles.fail(503);
            await toggleTheme();
            await vi.waitFor(() => {
                expect(error).toHaveBeenCalledOnce();
            });

            styles.recover();
            happen(created);
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'es')), FULL_SWAP);
            });

            expect(styles.urls()).toEqual([styleUrl('claro', 'es'), styleUrl('oscuro', 'es'), styleUrl('oscuro', 'es')]);
        });

        it('con el estilo al día, que vuelva la conexión o el contexto de WebGL no pide nada', async () => {
            const { loadedMap, toggleTheme } = await mountMap();
            const created = await loadedMap();

            await toggleTheme();
            await vi.waitFor(() => {
                expect(created.setStyle).toHaveBeenCalledOnce();
            });

            window.dispatchEvent(new Event('online'));
            created.fire('webglcontextrestored');
            await flushPromises();

            expect(styles.urls()).toEqual([styleUrl('claro', 'es'), styleUrl('oscuro', 'es')]);
            expect(created.setStyle).toHaveBeenCalledOnce();
        });

        it('con dos cambios seguidos, si el último no llega queda el anterior y al volver la conexión se pone al día', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { loadedMap, toggleTheme, inertia } = await mountMap();
            const created = await loadedMap();

            styles.hold();
            await toggleTheme();
            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(styles.pending.map((request) => request.url)).toEqual([styleUrl('oscuro', 'es'), styleUrl('oscuro', 'en')]);
            });

            // El último pedido falla y el anterior, que sí es válido, llega después.
            styles.pending[1]?.respond({ ok: false, status: 503 });
            styles.pending[0]?.respond();
            await flushPromises();

            expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'es')), FULL_SWAP);

            window.dispatchEvent(new Event('online'));
            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(3);
            });
            expect(styles.pending[2]?.url).toBe(styleUrl('oscuro', 'en'));

            styles.pending[2]?.respond();
            await flushPromises();

            expect(created.setStyle).toHaveBeenCalledTimes(2);
            expect(created.setStyle).toHaveBeenLastCalledWith(styleFrom(styleUrl('oscuro', 'en')), FULL_SWAP);
        });

        it('un estilo viejo que llega tarde no reemplaza al que se aplicó después de que fallara', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { loadedMap, toggleTheme, inertia } = await mountMap();
            const created = await loadedMap();

            styles.hold();
            await toggleTheme();
            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(2);
            });

            // El último falla, vuelve la conexión y el reintento llega antes que el primero.
            styles.pending[1]?.respond({ ok: false, status: 503 });
            await flushPromises();
            window.dispatchEvent(new Event('online'));
            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(3);
            });
            styles.pending[2]?.respond();
            styles.pending[0]?.respond();
            await flushPromises();

            expect(created.setStyle).toHaveBeenCalledExactlyOnceWith(styleFrom(styleUrl('oscuro', 'en')), FULL_SWAP);
        });
    });

    describe('errores', () => {
        it('si el estilo no se puede descargar muestra el error, en el idioma actual, con un botón para reintentar', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.fail(503);
            const { alert, skeleton, region, maplibre } = await mountMap({ locale: 'en' });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(alert().get('p').text()).toBe("We couldn't load the map. Check your connection and try again.");
            expect(alert().get('button').text()).toBe('Try again');
            expect(alert().get('button').attributes('type')).toBe('button');
            expect(alert().get('button').classes()).toContain('min-h-touch');
            expect(skeleton().exists()).toBe(false);
            expect(region().attributes('aria-busy')).toBe('false');
            expect(maplibre.maps).toHaveLength(0);
            expect(error).toHaveBeenCalledOnce();
        });

        it('al reintentar vuelve a pedir el estilo y pinta el mapa', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.fail(503);
            const { alert, skeleton, region, loadedMap } = await mountMap();

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            styles.recover();
            await alert().get('button').trigger('click');

            expect(alert().exists()).toBe(false);
            expect(skeleton().exists()).toBe(true);

            const created = await loadedMap();

            expect(styles.urls()).toEqual([styleUrl('claro', 'es'), styleUrl('claro', 'es')]);
            expect(region().attributes('aria-busy')).toBe('false');
            expect(skeleton().exists()).toBe(false);
            expect(created.container.style.visibility).toBe('');
        });

        it('avisa cada cambio de estado a quien lo usa: el error, la carga del reintento y el mapa a la vista', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.fail(503);
            const { alert, loadedMap, wrapper } = await mountMap();
            const emitted = () => wrapper.getComponent({ name: 'MapView' }).emitted('status');

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(emitted()).toEqual([['error']]);

            styles.recover();
            await alert().get('button').trigger('click');
            await loadedMap();

            expect(emitted()).toEqual([['error'], ['loading'], ['ready']]);
        });

        it('al reintentar el foco pasa a la región del mapa en vez de perderse con el botón', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.fail(503);
            const host = document.body.appendChild(document.createElement('div'));

            try {
                const { alert, region } = await mountMap({ attachTo: host });

                await vi.waitFor(() => {
                    expect(alert().exists()).toBe(true);
                });

                const button = alert().get('button');
                button.element.focus();
                expect(document.activeElement).toBe(button.element);

                styles.recover();
                await button.trigger('click');

                expect(region().attributes('tabindex')).toBe('-1');
                expect(document.activeElement).toBe(region().element);
            } finally {
                host.remove();
            }
        });

        it('si el navegador no puede crear el mapa muestra el error y suelta el protocolo de PMTiles', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { alert, maplibre } = await mountMap({ mapError: new Error('Failed to initialize WebGL') });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(maplibre.maps).toHaveLength(0);
            expect(maplibre.addProtocol).toHaveBeenCalledOnce();
            expect(maplibre.removeProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles');
        });

        it.each([
            ['es', 'Por ahora no podemos mostrarte el mapa en este dispositivo.', 'Reintentar'],
            ['en', "We can't show the map on this device right now.", 'Try again'],
        ] as const)('sin WebGL el mensaje (%s) no le echa la culpa a la conexión', async (locale, message, retry) => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { alert } = await mountMap({ locale, mapError: new Error('Failed to initialize WebGL') });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(alert().get('p').text()).toBe(message);
            expect(alert().get('button').text()).toBe(retry);
        });

        it('tras un fallo que no era de conexión, si el reintento falla por la conexión el mensaje cambia', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { alert } = await mountMap({ mapError: new Error('Failed to initialize WebGL') });

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            styles.fail(503);
            await alert().get('button').trigger('click');
            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(alert().get('p').text()).toBe('No pudimos cargar el mapa. Revisá tu conexión y volvé a intentar.');
        });

        it('si los tiles no abren muestra el error y libera el mapa', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { map, alert, maplibre } = await mountMap();
            const created = await map();

            // El índice del PMTiles no llegó: error de la fuente, sin tile.
            created.fire('error', { error: new Error('Failed to fetch'), sourceId: 'protomaps' });
            created.fire('load');
            await flushPromises();

            expect(alert().exists()).toBe(true);
            expect(created.remove).toHaveBeenCalledOnce();
            expect(maplibre.removeProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles');
            // El de MapLibre, que con un oyente propio ya no lo escribe, y el del componente.
            expect(error).toHaveBeenCalledTimes(2);
        });

        it('ya a la vista, si la fuente falla antes de terminar de cargar muestra el error y libera el mapa', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { map, alert } = await mountMap();
            const created = await map();

            created.fire('sourcedata', SOURCE_OPENED);
            await flushPromises();
            expect(alert().exists()).toBe(false);

            created.fire('error', { error: new Error('Failed to fetch'), sourceId: 'protomaps' });
            created.fire('load');
            await flushPromises();

            expect(alert().exists()).toBe(true);
            expect(created.remove).toHaveBeenCalledOnce();
        });

        it('si el mapa no empieza a pintar en 20 s muestra el error con el botón de reintentar y lo libera', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            useFakeClock();
            const { map, alert, skeleton, maplibre } = await mountMap();
            const created = await map();

            // Ni la fuente ni «load»: una petición colgada o un estilo que MapLibre no acepta.
            vi.advanceTimersByTime(19_000);
            await flushPromises();
            expect(alert().exists()).toBe(false);
            expect(skeleton().exists()).toBe(true);

            vi.advanceTimersByTime(1_000);
            await flushPromises();

            expect(alert().get('button').text()).toBe('Reintentar');
            expect(created.remove).toHaveBeenCalledOnce();
            expect(maplibre.removeProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles');
            expect(String(error.mock.calls.at(-1)?.[1])).toContain('20 s');
        });

        it('con el mapa ya a la vista no corre el plazo: los tiles pueden tardar con mala señal', async () => {
            useFakeClock();
            const { map, alert } = await mountMap();
            const created = await map();

            created.fire('sourcedata', SOURCE_OPENED);
            await flushPromises();
            vi.advanceTimersByTime(120_000);
            await flushPromises();

            expect(alert().exists()).toBe(false);
            expect(created.remove).not.toHaveBeenCalled();
            expect(created.container.style.visibility).toBe('');
        });

        it('si el worker de MapLibre no carga muestra el error sin esperar al plazo', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { map, alert } = await mountMap();
            const created = await map();

            // La fuente abre (no pasa por el worker) y el mapa queda a la vista, pero sin worker nunca habrá tiles.
            created.fire('sourcedata', SOURCE_OPENED);
            created.fire('error', { error: new Error('Worker failed to load. Check that the worker URL is correct.') });
            await flushPromises();

            expect(alert().exists()).toBe(true);
            expect(created.remove).toHaveBeenCalledOnce();
        });

        it('otro error sin fuente (un ícono que no baja) no tumba el mapa', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { map, alert } = await mountMap();
            const created = await map();

            created.fire('error', { error: new Error('Unable to load sprite') });
            created.fire('load');
            await flushPromises();

            expect(alert().exists()).toBe(false);
            expect(created.remove).not.toHaveBeenCalled();
        });

        it('un tile suelto que falla no tumba el mapa', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { map, alert, region } = await mountMap();
            const created = await map();

            created.fire('error', { error: new Error('Failed to fetch'), sourceId: 'protomaps', tile: {} });
            created.fire('load');
            await flushPromises();

            expect(alert().exists()).toBe(false);
            expect(region().attributes('aria-busy')).toBe('false');
            expect(created.remove).not.toHaveBeenCalled();
            // Ya pintado, los errores vuelven a ser asunto de MapLibre.
            expect(created.listenerCount('error')).toBe(0);
        });

        it('sin VITE_MAP_STYLE_URL muestra el error sin pedir nada', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.stubEnv('VITE_MAP_STYLE_URL', '');
            const { alert, maplibre } = await mountMap();

            await vi.waitFor(() => {
                expect(alert().exists()).toBe(true);
            });

            expect(styles.fetchMock).not.toHaveBeenCalled();
            expect(maplibre.maps).toHaveLength(0);
            expect(String(error.mock.calls[0]?.[1])).toContain('VITE_MAP_STYLE_URL');
            // No es la conexión de quien visita: a la app le falta configuración.
            expect(alert().get('p').text()).toBe('Por ahora no podemos mostrarte el mapa en este dispositivo.');
        });
    });

    describe('capas propias', () => {
        const EMPTY: MapGeoJson = { type: 'FeatureCollection', features: [] };
        const RESTAURANTS: MapGeoJson = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-76.1547, 4.4128] }, properties: { slug: 'la-ceiba' } }],
        };
        const GROUP: MapLayerGroup = {
            id: 'restaurants',
            sources: { restaurants: { type: 'geojson', data: EMPTY } },
            layers: [{ id: 'restaurants-points', type: 'circle', source: 'restaurants' }],
        };

        /** Un componente como los que van dentro de <MapView>: registra su grupo y no importa MapLibre. */
        async function restaurantsLayer() {
            const { useMapLayers } = await import('@/map/useMapLayers');
            const used: { layers?: MapLayers } = {};
            const Layer: Component = {
                setup() {
                    used.layers = useMapLayers(GROUP);

                    return () => null;
                },
            };

            return { Layer, used };
        }

        function layerIds(map: FakeMapLibre.Map): string[] {
            return (map.getStyle().layers ?? []).map((layer) => layer.id);
        }

        it('lo que va dentro de <MapView> registra sus capas cuando el mapa ya pinta', async () => {
            const { Layer } = await restaurantsLayer();
            const { map } = await mountMap({ inside: () => [Layer] });
            const created = await map();

            // Todavía cargando: el componente ya está montado, pero no hay mapa en el que pintar.
            expect(layerIds(created)).toEqual([]);

            created.fire('load');
            await flushPromises();

            expect(layerIds(created)).toEqual(['restaurants-points']);
        });

        it('tras cambiar el tema, la capa sigue en el estilo aplicado', async () => {
            const { Layer, used } = await restaurantsLayer();
            const { loadedMap, toggleTheme } = await mountMap({ inside: () => [Layer] });
            const created = await loadedMap();
            used.layers?.setData('restaurants', RESTAURANTS);

            await toggleTheme();
            await vi.waitFor(() => {
                expect(created.getStyle().name).toBe(styleUrl('oscuro', 'es'));
            });

            expect(layerIds(created)).toEqual(['restaurants-points']);
            expect(created.getStyle().sources?.restaurants?.data).toEqual(RESTAURANTS);
        });

        it('tras cambiar el idioma, también', async () => {
            const { Layer } = await restaurantsLayer();
            const { loadedMap, inertia } = await mountMap({ inside: () => [Layer] });
            const created = await loadedMap();

            inertia.receiveFromServer('en', { replace: true });
            await vi.waitFor(() => {
                expect(created.getStyle().name).toBe(styleUrl('claro', 'en'));
            });

            expect(layerIds(created)).toEqual(['restaurants-points']);
        });

        it('los datos que llegan antes que el mapa entran al registrarse', async () => {
            const { Layer, used } = await restaurantsLayer();
            const { map } = await mountMap({ inside: () => [Layer] });
            const created = await map();

            used.layers?.setData('restaurants', RESTAURANTS);
            created.fire('load');
            await flushPromises();

            expect(created.getStyle().sources?.restaurants?.data).toEqual(RESTAURANTS);
        });

        it('al reintentar, el mapa nuevo recibe las capas y sus datos', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { Layer, used } = await restaurantsLayer();
            const { map, alert, wrapper } = await mountMap({ inside: () => [Layer] });
            const first = await map();
            used.layers?.setData('restaurants', RESTAURANTS);

            // La fuente de los tiles no abre: el primer mapa se libera.
            first.fire('error', { error: new Error('Failed to fetch'), sourceId: 'protomaps' });
            first.fire('load');
            await flushPromises();
            expect(alert().exists()).toBe(true);

            await wrapper.get('[role="alert"] button').trigger('click');
            const second = await map(1);
            second.fire('load');
            await flushPromises();

            expect(layerIds(second)).toEqual(['restaurants-points']);
            expect(second.getStyle().sources?.restaurants?.data).toEqual(RESTAURANTS);
        });

        it('al desmontarse el componente, sus capas salen del mapa', async () => {
            const { Layer } = await restaurantsLayer();
            const shown = { value: true };
            const { loadedMap, wrapper } = await mountMap({ inside: () => (shown.value ? [Layer] : []) });
            const created = await loadedMap();

            expect(layerIds(created)).toEqual(['restaurants-points']);

            shown.value = false;
            wrapper.vm.$forceUpdate();
            await flushPromises();

            expect(layerIds(created)).toEqual([]);
            expect(Object.keys(created.getStyle().sources ?? {})).toEqual([]);
        });

        it('fuera de <MapView> avisa que no tiene dónde pintar', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const { Layer } = await restaurantsLayer();

            expect(() => mount(Layer)).toThrow('va dentro de <MapView>');
        });

        it('deja llevar la cámara a un punto, acercando si hace falta y sin alejar nunca', async () => {
            const { useMap } = await import('@/map/useMapLayers');
            const used: { map?: ReturnType<typeof useMap>['map'] } = {};
            const Camera: Component = {
                setup() {
                    used.map = useMap().map;

                    return () => null;
                },
            };
            const { loadedMap } = await mountMap({ inside: () => [Camera] });
            const created = await loadedMap();

            used.map?.value?.showPoint(ELSEWHERE, { minZoom: 16 });
            expect(created.easeTo).toHaveBeenLastCalledWith({ center: ELSEWHERE, zoom: 16 });

            // Quien usa el mapa ya estaba más cerca: se queda con su zoom.
            created.userMovesTo({ center: CENTER as [number, number], zoom: 18 });
            used.map?.value?.showPoint(ELSEWHERE, { minZoom: 16 });
            expect(created.easeTo).toHaveBeenLastCalledWith({ center: ELSEWHERE, zoom: 18 });
        });

        it('deja devolverle el foco a la región del mapa', async () => {
            const host = document.createElement('div');
            document.body.append(host);
            const { default: MapView } = await import('./MapView.vue');
            const view = mount(MapView, { attachTo: host });

            (view.vm as unknown as { focus: () => void }).focus();

            expect(document.activeElement).toBe(view.get('section').element);

            view.unmount();
            host.remove();
        });
    });

    describe('limpieza', () => {
        it('al desmontar libera el mapa y quita el protocolo de PMTiles', async () => {
            const { wrapper, loadedMap, maplibre } = await mountMap();
            const created = await loadedMap();

            expect(maplibre.removeProtocol).not.toHaveBeenCalled();

            wrapper.unmount();

            expect(created.remove).toHaveBeenCalledOnce();
            expect(maplibre.removeProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles');
        });

        it('ya desmontado, que vuelva la conexión no pide el estilo que había quedado pendiente', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { wrapper, loadedMap, toggleTheme } = await mountMap();
            await loadedMap();

            styles.fail(503);
            await toggleTheme();
            await vi.waitFor(() => {
                expect(styles.urls()).toHaveLength(2);
            });
            await flushPromises();

            wrapper.unmount();
            styles.recover();
            window.dispatchEvent(new Event('online'));
            await flushPromises();

            expect(styles.urls()).toHaveLength(2);
        });

        it('si se desmonta mientras baja el estilo, cancela la descarga y no crea el mapa', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            styles.hold();
            const { wrapper, maplibre } = await mountMap();

            await vi.waitFor(() => {
                expect(styles.pending).toHaveLength(1);
            });

            wrapper.unmount();
            await flushPromises();

            expect(styles.pending[0]?.signal?.aborted).toBe(true);
            expect(maplibre.maps).toHaveLength(0);
            expect(maplibre.addProtocol).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        });

        it('si se desmonta antes de que el mapa pinte, lo libera igual', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const { wrapper, map, maplibre } = await mountMap();
            const created = await map();

            wrapper.unmount();
            await flushPromises();

            expect(created.remove).toHaveBeenCalledOnce();
            expect(maplibre.removeProtocol).toHaveBeenCalledExactlyOnceWith('pmtiles');
            expect(error).not.toHaveBeenCalled();
        });

    });

    describe('movimiento reducido', () => {
        it('con prefers-reduced-motion quita el fundido de las etiquetas', async () => {
            stubReducedMotion(true);
            const { map } = await mountMap();

            expect((await map()).options.fadeDuration).toBe(0);
        });

        it('sin esa preferencia deja el fundido de MapLibre', async () => {
            const { map } = await mountMap();

            expect((await map()).options).not.toHaveProperty('fadeDuration');
        });
    });
});
