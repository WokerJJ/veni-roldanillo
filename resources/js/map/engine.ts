/**
 * Motor del mapa: MapLibre GL sobre el PMTiles de veni-mapa (ADR 0007).
 *
 * Este módulo y lo que importa pesan cientos de kB: se carga solo con
 * `import()` desde las pantallas que pintan un mapa (MapView.vue), nunca
 * desde el bundle inicial. Lo comprueba resources/js/map/bundle.test.ts.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../css/map.css';

import type { ErrorEvent, LngLatBoundsLike, LngLatLike, StyleSpecification } from 'maplibre-gl';
import { addProtocol, Map as MapLibreMap, NavigationControl, removeProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre busca su worker junto a su propio archivo; empaquetado, ese archivo
// ya no existe con ese nombre: Vite compila el worker y da su URL. Al compilar
// para producción, vite.config.ts (shareMapWorkerCode) resuelve este import
// para que el worker no repita el código que comparte con el hilo principal.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

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
    styleUrl: string;
    labels: MapLabels;
    /**
     * Dueño del mapa: al abortar se cancelan las descargas en curso y se
     * libera el mapa (WebGL, workers, eventos) y el protocolo de PMTiles.
     */
    signal: AbortSignal;
}

export interface MapHandle {
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

// Los estilos piden los tiles como pmtiles://…: MapLibre los lee por rangos
// HTTP. El protocolo es global en MapLibre: se registra con el primer mapa y
// se quita con el último. La instancia se conserva: guarda en memoria los
// índices del archivo y evita volver a pedirlos al regresar a una pantalla.
const protocol = new Protocol();
let mapsUsingProtocol = 0;

function acquireProtocol(): void {
    if (mapsUsingProtocol === 0) {
        addProtocol(PMTILES_PROTOCOL, protocol.tile);
    }

    mapsUsingProtocol += 1;
}

function releaseProtocol(): void {
    mapsUsingProtocol -= 1;

    if (mapsUsingProtocol === 0) {
        removeProtocol(PMTILES_PROTOCOL);
    }
}

async function fetchStyle(url: string, signal: AbortSignal): Promise<StyleSpecification> {
    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(`Estilo del mapa: HTTP ${String(response.status)} en ${url}`);
    }

    return (await response.json()) as StyleSpecification;
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
 * Espera a que el mapa pinte por primera vez. Si la fuente de los tiles no
 * abre (no llegó el índice del PMTiles), MapLibre igual lo da por cargado y lo
 * deja vacío: aquí cuenta como fallo. Un tile suelto que falla no: el resto
 * del mapa se ve.
 */
function firstLoad(map: MapLibreMap, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        let sourceError: ErrorEvent['error'] | undefined;

        const onError = (event: ErrorEvent & { sourceId?: unknown; tile?: unknown }): void => {
            // Con un oyente propio, MapLibre deja de escribir sus errores en la consola.
            console.error(event.error);

            if (event.sourceId !== undefined && event.tile === undefined) {
                sourceError ??= event.error;
            }
        };

        map.on('error', onError);
        signal.addEventListener(
            'abort',
            () => {
                reject(signal.reason as Error);
            },
            { once: true },
        );
        void map.once('load', () => {
            map.off('error', onError);

            if (sourceError) {
                reject(new Error('No se pudo abrir la fuente de tiles del mapa.', { cause: sourceError }));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Crea el mapa en `container` con el estilo de `styleUrl` y espera a que
 * pinte. La promesa se rechaza si el estilo o los tiles no se pueden
 * descargar, si el navegador no puede crear el mapa (sin WebGL) o si se
 * aborta `signal`: quien llama decide cómo mostrarlo.
 */
export async function createMap(options: CreateMapOptions): Promise<MapHandle> {
    const { container, labels, signal } = options;
    const style = await fetchStyle(options.styleUrl, signal);
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
        throw error;
    }

    let destroyed = false;

    const destroy = (): void => {
        if (destroyed) {
            return;
        }

        destroyed = true;
        map.remove();
        releaseProtocol();
    };

    signal.addEventListener('abort', destroy, { once: true });

    try {
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        applyLabels(map, labels);

        await firstLoad(map, signal);
    } catch (error) {
        destroy();
        throw error;
    }

    let styleRequest = 0;

    return {
        async setStyle(url) {
            // Con cambios seguidos (tema y luego idioma) solo se aplica el último pedido.
            styleRequest += 1;
            const request = styleRequest;
            const next = await fetchStyle(url, signal);

            if (destroyed || request !== styleRequest) {
                return;
            }

            // diff: false reemplaza el estilo entero (cada tema trae sus
            // sprites); la cámara es del mapa, no del estilo, y no se mueve.
            map.setStyle(next, { diff: false });
        },
        setLabels(next) {
            if (!destroyed) {
                applyLabels(map, next);
            }
        },
    };
}
