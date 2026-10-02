/**
 * Motor del mapa: MapLibre GL sobre el PMTiles de veni-mapa (ADR 0007).
 *
 * Este módulo y lo que importa pesan cientos de kB: se carga solo con
 * `import()` desde las pantallas que pintan un mapa (MapView.vue), nunca
 * desde el bundle inicial. Lo comprueba resources/js/map/bundle.test.ts.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../css/map.css';

import type { AddProtocolAction, ErrorEvent, LngLatBoundsLike, LngLatLike, MapSourceDataEvent, StyleSpecification } from 'maplibre-gl';
import { addProtocol, Map as MapLibreMap, NavigationControl, removeProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre busca su worker junto a su propio archivo; empaquetado, ese archivo
// ya no existe con ese nombre: Vite compila el worker y da su URL. Al compilar
// para producción, vite.config.ts (shareMapWorkerCode) resuelve este import
// para que el worker no repita el código que comparte con el hilo principal.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import { MapUnavailableError } from './errors';
import { fetchMapStyle } from './fetchStyle';

setWorkerUrl(workerUrl);

/** Textos que MapLibre pinta por su cuenta, en el idioma de la interfaz. */
export interface MapLabels {
    /** Nombre accesible del lienzo, que recibe el foco del teclado. */
    canvas: string;
    zoomIn: string;
    zoomOut: string;
}

export interface CreateMapOptions {
    container: HTMLElement;
    /**
     * El estilo, ya pedido con `fetchMapStyle`: quien pinta el mapa lo pide
     * mientras baja este módulo, sin esperarlo.
     */
    style: Promise<StyleSpecification>;
    labels: MapLabels;
    /**
     * Dueño del mapa: al abortar se cancelan las descargas en curso y se
     * libera el mapa (WebGL, workers, eventos) y el protocolo de PMTiles.
     */
    signal: AbortSignal;
}

export interface MapHandle {
    /**
     * Se cumple cuando el mapa termina de pintar por primera vez. Se rechaza
     * si hasta entonces falla la fuente de los tiles o el worker de MapLibre,
     * o si se aborta la señal: el mapa queda liberado. Quien crea el mapa
     * tiene que esperarla (o atender su rechazo).
     */
    readonly loaded: Promise<void>;
    /** Cambia de estilo (otro tema u otro idioma) sin mover la cámara. */
    setStyle(url: string): Promise<void>;
    setLabels(labels: MapLabels): void;
}

interface Camera {
    center: LngLatLike;
    zoom: number;
    maxBounds?: LngLatBoundsLike;
}

const PMTILES_PROTOCOL = 'pmtiles';

/** Plazo para que el mapa empiece a pintar; pasado, se muestra el error con «Reintentar». */
const FIRST_PAINT_TIMEOUT_MS = 20_000;

/**
 * Así empieza el mensaje del error con que MapLibre avisa que su worker no
 * cargó (no trae otra seña). resources/js/map/bundle.test.ts falla si una
 * versión nueva de MapLibre lo cambia.
 */
const WORKER_ERROR = 'Worker failed to load';

// Los estilos piden los tiles como pmtiles://…: MapLibre los lee por rangos
// HTTP. El protocolo es global en MapLibre: se registra con el primer mapa y
// se quita con el último. La instancia se conserva: guarda en memoria los
// índices del archivo y evita volver a pedirlos al regresar a una pantalla.
let protocol = new Protocol();
let mapsUsingProtocol = 0;

/**
 * Lo que MapLibre llama para leer del PMTiles. PMTiles guarda en memoria la
 * cabecera y los índices del archivo, y también la descarga que falló: con la
 * misma instancia, cada petición posterior fallaría sin salir a la red y
 * «Reintentar» no serviría de nada. Si una lectura falla (no si MapLibre la
 * canceló), la instancia se cambia por una nueva, que vuelve a pedir.
 */
const readArchive: AddProtocolAction = async (request, abortController) => {
    const current = protocol;

    try {
        return await current.tile(request, abortController);
    } catch (error) {
        if (!abortController.signal.aborted && protocol === current) {
            protocol = new Protocol();
        }

        throw error;
    }
};

function acquireProtocol(): void {
    if (mapsUsingProtocol === 0) {
        addProtocol(PMTILES_PROTOCOL, readArchive);
    }

    mapsUsingProtocol += 1;
}

function releaseProtocol(): void {
    mapsUsingProtocol -= 1;

    if (mapsUsingProtocol === 0) {
        removeProtocol(PMTILES_PROTOCOL);
    }
}

function isNumberList(value: unknown, length: number): value is number[] {
    return Array.isArray(value) && value.length === length && value.every((item) => Number.isFinite(item));
}

/**
 * Cámara inicial y límites, tomados del estilo: los fija veni-mapa con la
 * región del extracto (`center`, `zoom` y `metadata["veni:bounds"]`). La
 * cámara es obligatoria: sin ella MapLibre arranca en 0,0 con zoom 0.
 */
function initialCamera(style: StyleSpecification): Camera {
    const { center, zoom } = style;

    if (!isNumberList(center, 2) || typeof zoom !== 'number') {
        throw new Error('El estilo del mapa no trae la cámara inicial (center y zoom).');
    }

    const camera: Camera = { center: [center[0], center[1]], zoom };
    const bounds = (style.metadata as Record<string, unknown> | undefined)?.['veni:bounds'];

    if (isNumberList(bounds, 4)) {
        // [oeste, sur, este, norte]: la cámara no sale de la región del extracto.
        camera.maxBounds = bounds as [number, number, number, number];
    }

    return camera;
}

function applyLabels(map: MapLibreMap, labels: MapLabels): void {
    map.getCanvas().setAttribute('aria-label', labels.canvas);

    const buttons = [
        ['.maplibregl-ctrl-zoom-in', labels.zoomIn],
        ['.maplibregl-ctrl-zoom-out', labels.zoomOut],
    ] as const;

    for (const [selector, label] of buttons) {
        const button = map.getContainer().querySelector(selector);
        button?.setAttribute('title', label);
        button?.setAttribute('aria-label', label);
    }
}

/**
 * Sigue la primera carga del mapa hasta que MapLibre avisa «load» (todo lo
 * que se ve está pintado). Antes avisa con `onPainting` cuando el mapa empieza
 * a pintar: abrió la fuente de los tiles (llegó el índice del PMTiles) y ya
 * dibuja el fondo y los tiles a medida que llegan.
 *
 * Cuenta como fallo:
 *
 * - Que la fuente de los tiles no abra: MapLibre igual da el mapa por cargado
 *   y lo deja vacío. Un tile suelto que falla no: el resto del mapa se ve.
 * - Que el worker de MapLibre no cargue: MapLibre solo avisa con un error, y
 *   sin worker no hay tiles ni «load».
 * - Que el mapa no empiece a pintar dentro del plazo (una petición colgada,
 *   un estilo que MapLibre no acepta). Ya pintando no hay plazo: con mala
 *   señal los tiles pueden tardar, y el mapa se usa mientras llegan.
 */
function firstLoad(map: MapLibreMap, signal: AbortSignal, onPainting: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
        let sourceError: ErrorEvent['error'] | undefined;
        let painting = false;

        const startPainting = (): void => {
            if (!painting) {
                painting = true;
                clearTimeout(deadline);
                onPainting();
            }
        };

        const settle = (): void => {
            clearTimeout(deadline);
            map.off('error', onError);
            map.off('sourcedata', onSourceData);
            map.off('load', onLoad);
            signal.removeEventListener('abort', onAbort);
        };

        const onError = (event: ErrorEvent & { sourceId?: unknown; tile?: unknown }): void => {
            // Con un oyente propio, MapLibre deja de escribir sus errores en la consola.
            console.error(event.error);

            if (event.sourceId !== undefined) {
                if (event.tile === undefined) {
                    sourceError ??= event.error;
                }
            } else if (event.error.message.startsWith(WORKER_ERROR)) {
                settle();
                reject(new Error('No se pudo cargar el worker del mapa.', { cause: event.error }));
            }
        };

        const onSourceData = (event: MapSourceDataEvent): void => {
            if (event.sourceDataType === 'metadata') {
                startPainting();
            }
        };

        const onLoad = (): void => {
            settle();

            if (sourceError) {
                reject(new Error('No se pudo abrir la fuente de tiles del mapa.', { cause: sourceError }));
            } else {
                startPainting();
                resolve();
            }
        };

        const onAbort = (): void => {
            settle();
            reject(signal.reason as Error);
        };

        const deadline = setTimeout(() => {
            settle();
            reject(new Error(`El mapa no empezó a pintar en ${String(FIRST_PAINT_TIMEOUT_MS / 1000)} s.`));
        }, FIRST_PAINT_TIMEOUT_MS);

        map.on('error', onError);
        map.on('sourcedata', onSourceData);
        map.on('load', onLoad);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Crea el mapa en `container` con el estilo de `style` y espera a que
 * empiece a pintar: desde ahí se puede mostrar, y `loaded` (en lo que
 * devuelve) dice cuándo termina. La promesa se rechaza si el estilo o los
 * tiles no se pueden descargar, si el navegador no puede crear el mapa (sin
 * WebGL), si no empieza a pintar a tiempo o si se aborta `signal`: quien
 * llama decide cómo mostrarlo. En cualquier fallo el mapa queda liberado.
 */
export async function createMap(options: CreateMapOptions): Promise<MapHandle> {
    const { container, labels, signal } = options;
    const style = await options.style;
    signal.throwIfAborted();
    const camera = initialCamera(style);

    acquireProtocol();

    let map: MapLibreMap;

    try {
        map = new MapLibreMap({
            container,
            style,
            ...camera,
            // La atribución de OpenStreetMap viene en el estilo y queda
            // siempre desplegada, también en pantallas angostas.
            attributionControl: { compact: false },
            // Mapa siempre con el norte arriba y sin inclinación: un pueblo
            // se recorre mejor así y no hace falta el botón de brújula.
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            // MapLibre ya quita la inercia y las animaciones de cámara con
            // prefers-reduced-motion; el fundido de las etiquetas, no.
            ...(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? { fadeDuration: 0 } : {}),
        });
    } catch (error) {
        releaseProtocol();
        // Sin WebGL (o con la GPU bloqueada) MapLibre no puede crear el mapa.
        throw new MapUnavailableError('El navegador no pudo crear el mapa.', { cause: error });
    }

    let destroyed = false;
    /** Deja de escuchar la conexión (se llena más abajo, con el mapa ya a la vista). */
    let stopRetrying = (): void => undefined;

    const destroy = (): void => {
        if (destroyed) {
            return;
        }

        destroyed = true;
        stopRetrying();
        map.remove();
        releaseProtocol();
    };

    signal.addEventListener('abort', destroy, { once: true });

    let loaded: Promise<void>;

    try {
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        applyLabels(map, labels);

        let startedPainting: () => void = () => undefined;
        const painting = new Promise<void>((resolve) => {
            startedPainting = resolve;
        });

        loaded = firstLoad(map, signal, startedPainting);
        await Promise.race([painting, loaded]);
    } catch (error) {
        destroy();
        throw error;
    }

    let lastRequested = 0;
    let lastApplied = 0;
    /** El último estilo pedido, si no llegó: se vuelve a pedir cuando haya con qué. */
    let missedStyleUrl: string | null = null;

    const changeStyle = async (url: string): Promise<void> => {
        lastRequested += 1;
        const request = lastRequested;
        missedStyleUrl = null;

        let next: StyleSpecification;

        try {
            next = await fetchMapStyle(url, signal);
        } catch (error) {
            if (request === lastRequested && !destroyed) {
                missedStyleUrl = url;
            }

            throw error;
        }

        // Con cambios seguidos (tema y luego idioma) las respuestas llegan en
        // cualquier orden: una más vieja que el estilo que ya se ve se
        // descarta. Una más nueva se aplica aunque después se haya pedido
        // otro: si ese otro no llega, queda a la vista el último válido.
        if (destroyed || request < lastApplied) {
            return;
        }

        lastApplied = request;
        // diff: false reemplaza el estilo entero (cada tema trae sus
        // sprites); la cámara es del mapa, no del estilo, y no se mueve.
        map.setStyle(next, { diff: false });
    };

    // Si el estilo nuevo no llegó (sin señal al cambiar de tema o de idioma),
    // el mapa sigue con el anterior. Se reintenta cuando vuelve la conexión y
    // cuando el navegador devuelve el contexto de WebGL (la pestaña vuelve del
    // fondo), no en bucle: con mala señal cada intento cuesta datos.
    const retryMissedStyle = (): void => {
        if (missedStyleUrl === null) {
            return;
        }

        changeStyle(missedStyleUrl).catch((error: unknown) => {
            if (!signal.aborted) {
                console.error('[mapa] No se pudo cambiar el estilo del mapa.', error);
            }
        });
    };

    window.addEventListener('online', retryMissedStyle);
    map.on('webglcontextrestored', retryMissedStyle);
    stopRetrying = (): void => {
        window.removeEventListener('online', retryMissedStyle);
    };

    return {
        // Si la carga falla con el mapa ya a la vista, también se libera.
        loaded: loaded.catch((error: unknown) => {
            destroy();
            throw error;
        }),
        setStyle: changeStyle,
        setLabels(next) {
            if (!destroyed) {
                applyLabels(map, next);
            }
        },
    };
}
