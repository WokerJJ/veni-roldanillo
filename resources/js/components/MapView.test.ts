import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import { defineComponent, h } from 'vue';

import type { MapGeoJson, MapLayerGroup } from '@/map/layers';
import type { MapLayers } from '@/map/useMapLayers';
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
}: {
    theme?: 'light' | 'dark';
    locale?: 'es' | 'en';
    mapError?: Error;
    attachTo?: HTMLElement;
    /** Lo que la app pinta sobre el mapa: componentes dentro de <MapView>. */
    inside?: () => Component[];
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
            render: () => [h(ThemeToggle), h(MapView, null, { default: () => (inside?.() ?? []).map((layer) => h(layer)) })],
        }),
        attachTo ? { attachTo } : {},
    );

    /** El mapa creado (espera a que baje el motor y llegue el estilo). */
    const map = async (index = 0) => {
        await vi.waitFor(() => {
            expect(maplibre.maps.length).toBeGreaterThan(index);
        });

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

            expect(created.container.classList.contains('invisible')).toBe(true);

            created.fire('load');
            await flushPromises();

            expect(region().attributes('aria-busy')).toBe('false');
            expect(skeleton().exists()).toBe(false);
            expect(created.container.classList.contains('invisible')).toBe(false);
        });

        it('deja ver el mapa en cuanto abre la fuente de los tiles, sin esperar a que termine de cargar', async () => {
            const { map, region, skeleton } = await mountMap();
            const created = await map();

            // Llegó el índice del PMTiles: MapLibre ya pinta el fondo y va trayendo los tiles.
            created.fire('sourcedata', SOURCE_OPENED);
            await flushPromises();

            expect(skeleton().exists()).toBe(false);
            expect(region().attributes('aria-busy')).toBe('false');
            expect(created.container.classList.contains('invisible')).toBe(false);
        });

        it('otro aviso de la fuente (que empezó a pedirla) todavía no lo deja ver', async () => {
            const { map, skeleton } = await mountMap();
            const created = await map();

            created.fire('sourcedata', { dataType: 'source', sourceDataType: 'visibility', sourceId: 'protomaps' });
            await flushPromises();

            expect(skeleton().exists()).toBe(true);
            expect(created.container.classList.contains('invisible')).toBe(true);
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
    });

    describe('controles', () => {
        it('trae los botones de zoom de MapLibre con sus textos en el idioma actual', async () => {
            const { loadedMap } = await mountMap();
            const created = await loadedMap();
            const [zoomIn, zoomOut] = created.container.querySelectorAll('button');

            expect(created.container.querySelectorAll('button')).toHaveLength(2);
            expect(zoomIn?.title).toBe('Acercar');
            expect(zoomIn?.getAttribute('aria-label')).toBe('Acercar');
            expect(zoomOut?.title).toBe('Alejar');
            expect(zoomOut?.getAttribute('aria-label')).toBe('Alejar');
            expect(created.getCanvas().getAttribute('aria-label')).toMatch(/^Mapa interactivo\./);
        });

        it('no trae brújula ni deja girar o inclinar el mapa', async () => {
            const { loadedMap } = await mountMap();
            const created = await loadedMap();

            expect(created.controls).toHaveLength(1);
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

            // Los únicos botones de la región son los dos de zoom de MapLibre.
            expect(region().findAll('button').map((button) => button.attributes('title'))).toEqual(['Acercar', 'Alejar']);
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
            expect([...created.container.querySelectorAll('button')].map((button) => button.title)).toEqual(['Zoom in', 'Zoom out']);
            expect([...created.container.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual([
                'Zoom in',
                'Zoom out',
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
            expect(created.container.classList.contains('invisible')).toBe(false);
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
            expect(created.container.classList.contains('invisible')).toBe(false);
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
