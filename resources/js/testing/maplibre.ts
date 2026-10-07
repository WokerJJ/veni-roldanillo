/**
 * Doble de maplibre-gl para Vitest: happy-dom no tiene WebGL. Reproduce lo
 * que usa resources/js/map/engine.ts (el mapa, sus eventos, los botones de
 * zoom con las clases de MapLibre y el estilo con sus fuentes, capas e
 * imágenes) y deja a la vista lo que la app le pide.
 * Uso:
 *
 *     vi.mock('maplibre-gl', () => import('@/testing/maplibre'));
 *
 * vi.mock guarda este módulo entre pruebas aunque se llame a
 * vi.resetModules(): cada prueba empieza con reset().
 */
import { vi } from 'vitest';

type Listener = (event: unknown) => void;

interface Registration {
    type: string;
    listener: Listener;
    once: boolean;
}

/** Mapas creados desde el último reset(), en orden. */
export const maps: FakeMap[] = [];

let nextMapError: Error | null = null;

class FakeNavigationControl {
    constructor(readonly options: Record<string, unknown> = {}) {}

    /** Los botones, con los textos en inglés que MapLibre pone por defecto. */
    onAdd(): HTMLElement {
        const group = document.createElement('div');
        group.className = 'maplibregl-ctrl maplibregl-ctrl-group';

        for (const [name, title] of [
            ['zoom-in', 'Zoom in'],
            ['zoom-out', 'Zoom out'],
        ] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `maplibregl-ctrl-${name}`;
            button.title = title;
            button.setAttribute('aria-label', title);
            group.append(button);
        }

        return group;
    }
}

/** Lo que un estilo, las opciones del mapa o un movimiento dicen de la cámara. */
interface CameraChange {
    center?: unknown;
    zoom?: unknown;
}

/** Un estilo como lo ve MapLibre: sus fuentes por id y sus capas en orden. */
export interface FakeStyle extends CameraChange {
    sources?: Record<string, Record<string, unknown>>;
    layers?: { id: string; [key: string]: unknown }[];
    [key: string]: unknown;
}

interface StyleSwap {
    diff?: boolean;
    transformStyle?: (previous: FakeStyle | undefined, next: FakeStyle) => FakeStyle;
}

/** Una figura que MapLibre «pintó»: lo que devuelve queryRenderedFeatures. */
export interface RenderedFeature {
    layer: { id: string };
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
}

interface ScreenPoint {
    x: number;
    y: number;
}

/** Fuente GeoJSON de un estilo: guarda sus datos y los deja cambiar. */
class FakeSource {
    /** El zoom al que MapLibre dice que un grupo de puntos se abre. */
    expansionZoom = 16;

    constructor(public spec: Record<string, unknown>) {}

    readonly setData = vi.fn((data: unknown) => {
        this.spec = { ...this.spec, data };

        return Promise.resolve();
    });

    readonly getClusterExpansionZoom = vi.fn<(clusterId: number) => Promise<number>>(() => Promise.resolve(this.expansionZoom));
}

const STYLE_NOT_LOADED = 'Style is not done loading.';

class FakeMap {
    readonly container: HTMLElement;
    readonly controls: FakeNavigationControl[] = [];
    readonly touchZoomRotate = { disableRotation: vi.fn() };
    readonly keyboard = { disableRotation: vi.fn() };

    /**
     * Con `true`, un estilo pedido con setStyle() queda sin cargar hasta que
     * la prueba llama a finishStyleLoad(): MapLibre lo carga en el siguiente
     * cuadro, y mientras tanto no deja tocar fuentes ni capas.
     */
    holdStyleLoads = false;

    // La cámara, como en MapLibre: arranca en 0,0 con zoom 0 y «sin tocar»
    // hasta que algo la mueve (las opciones, la app o quien usa el mapa).
    private center: unknown = [0, 0];
    private zoom: unknown = 0;
    private cameraUntouched = true;

    private base: FakeStyle = {};
    private sources = new Map<string, FakeSource>();
    private layers: { id: string; [key: string]: unknown }[] = [];
    private images = new Map<string, { image: unknown; options: unknown }>();
    private styleLoaded = false;
    private pendingStyles: { style: FakeStyle; options: StyleSwap | undefined }[] = [];
    private rendered: RenderedFeature[] = [];

    /**
     * Como MapLibre cada vez que carga un estilo: el `center` y el `zoom` del
     * estilo mandan solo mientras nadie haya tocado la cámara. Por eso cambiar
     * de estilo no devuelve el mapa al centro del pueblo.
     *
     * El estilo nuevo reemplaza al anterior entero (`diff: false`): se van las
     * fuentes, las capas y las imágenes añadidas en ejecución. No queda
     * cargado al instante: MapLibre lo carga en el siguiente cuadro, y ahí
     * llama a `transformStyle`. Si ya había otro cargándose, espera su turno.
     */
    readonly setStyle = vi.fn((style: FakeStyle, options?: StyleSwap) => {
        if (this.cameraUntouched) {
            this.moveCamera(style);
        }

        this.pendingStyles.push({ style, options });
        this.styleLoaded = false;

        if (!this.holdStyleLoads) {
            queueMicrotask(() => {
                this.finishStyleLoad();
            });
        }
    });
    // Lo que mueve la cámara: las pruebas comprueban que la app no lo llama
    // y, con getCenter() y getZoom(), que la cámara sigue donde estaba.
    readonly jumpTo = vi.fn((camera: CameraChange) => {
        this.moveCamera(camera);
    });
    readonly easeTo = vi.fn((camera: CameraChange) => {
        this.moveCamera(camera);
    });
    readonly flyTo = vi.fn((camera: CameraChange) => {
        this.moveCamera(camera);
    });
    readonly setCenter = vi.fn((center: unknown) => {
        this.moveCamera({ center });
    });
    readonly setZoom = vi.fn((zoom: unknown) => {
        this.moveCamera({ zoom });
    });
    readonly fitBounds = vi.fn((bounds: unknown) => {
        // Sin proyección no hay centro que calcular: queda la marca de que se movió.
        this.moveCamera({ center: bounds });
    });
    /** Como MapLibre: deja el contenedor vacío. */
    readonly remove = vi.fn(() => {
        this.container.replaceChildren();
        this.registrations = [];
    });

    readonly addSource = vi.fn((id: string, spec: Record<string, unknown>) => {
        this.requireLoadedStyle();

        if (this.sources.has(id)) {
            throw new Error(`Source "${id}" already exists.`);
        }

        this.sources.set(id, new FakeSource(spec));
    });
    readonly removeSource = vi.fn((id: string) => {
        this.requireLoadedStyle();

        if (this.layers.some((layer) => layer.source === id)) {
            throw new Error(`Source "${id}" cannot be removed while layer is using it.`);
        }

        this.sources.delete(id);
    });
    readonly addLayer = vi.fn((layer: { id: string; [key: string]: unknown }, before?: string) => {
        this.requireLoadedStyle();

        if (this.layers.some((existing) => existing.id === layer.id)) {
            throw new Error(`Layer "${layer.id}" already exists on this map.`);
        }

        if (typeof layer.source === 'string' && !this.sources.has(layer.source)) {
            throw new Error(`Source "${layer.source}" not found.`);
        }

        const index = before === undefined ? -1 : this.layers.findIndex((existing) => existing.id === before);

        if (index === -1) {
            this.layers.push(layer);
        } else {
            this.layers.splice(index, 0, layer);
        }
    });
    readonly removeLayer = vi.fn((id: string) => {
        this.requireLoadedStyle();
        this.layers = this.layers.filter((layer) => layer.id !== id);
    });
    readonly addImage = vi.fn((id: string, image: unknown, options?: unknown) => {
        if (this.images.has(id)) {
            throw new Error(`An image named "${id}" already exists.`);
        }

        this.images.set(id, { image, options });
    });
    readonly removeImage = vi.fn((id: string) => {
        this.images.delete(id);
    });
    /** Lo «pintado» que toca el rectángulo pedido, de las capas pedidas. */
    readonly queryRenderedFeatures = vi.fn((box: [[number, number], [number, number]], options: { layers: string[] }) => {
        for (const id of options.layers) {
            if (!this.layers.some((layer) => layer.id === id)) {
                throw new Error(`The layer '${id}' does not exist in the map's style and cannot be queried for features.`);
            }
        }

        const [[left, top], [right, bottom]] = box;

        return this.rendered.filter((feature) => {
            if (!options.layers.includes(feature.layer.id)) {
                return false;
            }

            const { x, y } = this.project(feature.geometry.coordinates as [number, number]);

            return x >= left && x <= right && y >= top && y <= bottom;
        });
    });

    private readonly canvas = document.createElement('canvas');
    private registrations: Registration[] = [];

    constructor(readonly options: Record<string, unknown>) {
        if (nextMapError) {
            const error = nextMapError;
            nextMapError = null;

            throw error;
        }

        this.container = options.container as HTMLElement;
        this.canvas.setAttribute('aria-label', 'Map');
        this.container.append(this.canvas);
        // Primero la cámara de las opciones; la del estilo, solo si no vino en ellas.
        this.moveCamera(options);

        if (typeof options.style === 'object' && options.style !== null) {
            const style = options.style as FakeStyle;

            if (this.cameraUntouched) {
                this.moveCamera(style);
            }

            this.applyStyle(style);
            this.styleLoaded = true;
        }

        maps.push(this);
    }

    getCenter(): unknown {
        return this.center;
    }

    getZoom(): unknown {
        return this.zoom;
    }

    /** Lo que hace quien usa el mapa al arrastrarlo o acercarlo: mueve la cámara sin pasar por la app. */
    userMovesTo(camera: { center: [number, number]; zoom: number }): void {
        this.moveCamera(camera);
    }

    private moveCamera(camera: CameraChange): void {
        if (camera.center === undefined && camera.zoom === undefined) {
            return;
        }

        this.center = camera.center ?? this.center;
        this.zoom = camera.zoom ?? this.zoom;
        this.cameraUntouched = false;
    }

    private requireLoadedStyle(): void {
        if (!this.styleLoaded) {
            throw new Error(STYLE_NOT_LOADED);
        }
    }

    private applyStyle(style: FakeStyle): void {
        const { sources = {}, layers = [], ...base } = style;

        this.base = base;
        this.sources = new Map(Object.entries(sources).map(([id, spec]) => [id, new FakeSource(spec)]));
        this.layers = [...layers];
        this.images = new Map();
    }

    /**
     * Termina de cargar el estilo más viejo de los pedidos, como MapLibre un
     * cuadro después de setStyle(): le pasa el estilo a `transformStyle`, lo
     * aplica y avisa «style.load». Si hay otro esperando, cuando avisa ya
     * empezó a cargarlo: el mapa vuelve a estar sin estilo cargado.
     */
    finishStyleLoad(): void {
        const next = this.pendingStyles.shift();

        if (!next) {
            return;
        }

        const previous = this.getStyle();
        this.applyStyle(next.options?.transformStyle ? next.options.transformStyle(previous, next.style) : next.style);
        this.styleLoaded = this.pendingStyles.length === 0;
        this.fire('style.load');

        if (!this.holdStyleLoads && this.pendingStyles.length > 0) {
            queueMicrotask(() => {
                this.finishStyleLoad();
            });
        }
    }

    /** El estilo aplicado: el que llegó más lo añadido en ejecución. */
    getStyle(): FakeStyle {
        return {
            ...this.base,
            sources: Object.fromEntries([...this.sources].map(([id, source]) => [id, source.spec])),
            layers: [...this.layers],
        };
    }

    getSource(id: string): FakeSource | undefined {
        return this.styleLoaded ? this.sources.get(id) : undefined;
    }

    getLayer(id: string): { id: string } | undefined {
        return this.styleLoaded ? this.layers.find((layer) => layer.id === id) : undefined;
    }

    hasImage(id: string): boolean {
        return this.images.has(id);
    }

    /** Ids de las imágenes añadidas al estilo aplicado. */
    imageIds(): string[] {
        return [...this.images.keys()];
    }

    /** Proyección de juguete: un grado es un millón de píxeles, con el norte arriba. */
    project(lngLat: [number, number]): ScreenPoint {
        return { x: (lngLat[0] + 76.2) * 1_000_000, y: (4.5 - lngLat[1]) * 1_000_000 };
    }

    /** Lo que MapLibre tiene pintado en pantalla (para queryRenderedFeatures). */
    render(features: RenderedFeature[]): void {
        this.rendered = features;
    }

    /** Quien usa el mapa toca (o hace clic) en ese punto de la pantalla. */
    click(point: ScreenPoint): void {
        this.fire('click', { point });
    }

    /** El puntero pasa por ese punto de la pantalla. */
    hover(point: ScreenPoint): void {
        this.fire('mousemove', { point });
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    getContainer(): HTMLElement {
        return this.container;
    }

    addControl(control: FakeNavigationControl): this {
        this.controls.push(control);
        this.container.append(control.onAdd());

        return this;
    }

    on(type: string, listener: Listener): this {
        this.registrations.push({ type, listener, once: false });

        return this;
    }

    once(type: string, listener: Listener): this {
        this.registrations.push({ type, listener, once: true });

        return this;
    }

    off(type: string, listener: Listener): this {
        this.registrations = this.registrations.filter((entry) => entry.type !== type || entry.listener !== listener);

        return this;
    }

    /** Cuántos oyentes quedan de un evento. */
    listenerCount(type: string): number {
        return this.registrations.filter((entry) => entry.type === type).length;
    }

    /** Lo que hace MapLibre al ocurrir algo: avisa a los oyentes de ese evento. */
    fire(type: string, event: unknown = {}): void {
        const current = this.registrations.filter((entry) => entry.type === type);
        this.registrations = this.registrations.filter((entry) => entry.type !== type || !entry.once);

        for (const entry of current) {
            entry.listener(event);
        }
    }
}

export const addProtocol = vi.fn();
export const removeProtocol = vi.fn();
export const setWorkerUrl = vi.fn();

export { FakeMap as Map, FakeNavigationControl as NavigationControl, FakeSource as GeoJSONSource };

/** El siguiente `new Map()` lanza este error, como un navegador sin WebGL. */
export function failNextMap(error: Error): void {
    nextMapError = error;
}

/** Sin mapas, sin fallos pendientes y con las funciones espiadas sin llamadas. */
export function reset(): void {
    maps.length = 0;
    nextMapError = null;
    addProtocol.mockReset();
    removeProtocol.mockReset();
    setWorkerUrl.mockReset();
}
