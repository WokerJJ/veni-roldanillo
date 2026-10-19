/**
 * Doble de maplibre-gl para Vitest: happy-dom no tiene WebGL. Reproduce lo
 * que usa resources/js/map/engine.ts (el mapa, sus eventos, los botones de
 * zoom con las clases de MapLibre, el control de geolocalización y el estilo
 * con sus fuentes, capas e imágenes) y deja a la vista lo que la app le pide.
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

/** Lo que MapLibre le pide a un control: que se arme para un mapa y que se quite. */
interface FakeControl {
    readonly options: Record<string, unknown>;
    onAdd(map: FakeMap): HTMLElement;
    onRemove(): void;
}

class FakeNavigationControl implements FakeControl {
    constructor(readonly options: Record<string, unknown> = {}) {}

    onRemove(): void {
        // Sus botones se van con el contenedor.
    }

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

/** La posición que da la API Geolocation del navegador (resources/js/testing/geolocation.ts). */
export interface FakeGeolocationPosition {
    coords: { latitude: number; longitude: number; accuracy: number };
    timestamp: number;
}

/** El error de la API Geolocation: 1, sin permiso; 2, sin posición; 3, tiempo agotado. */
export interface FakeGeolocationError {
    code: number;
    message: string;
}

interface FakeGeolocateOptions {
    positionOptions?: PositionOptions;
    fitBoundsOptions?: Record<string, unknown>;
    trackUserLocation?: boolean;
    showUserLocation?: boolean;
    showAccuracyCircle?: boolean;
    [option: string]: unknown;
}

type WatchState = 'OFF' | 'WAITING_ACTIVE' | 'ACTIVE_LOCK' | 'ACTIVE_ERROR' | 'BACKGROUND' | 'BACKGROUND_ERROR';

const GEOLOCATE_DEFAULTS: FakeGeolocateOptions = {
    positionOptions: { enableHighAccuracy: false, maximumAge: 0, timeout: 6000 },
    fitBoundsOptions: { maxZoom: 15 },
    trackUserLocation: false,
    showUserLocation: true,
    showAccuracyCircle: true,
};

/** Lo que MapLibre averiguó de la geolocalización: una vez por página (reset() lo olvida). */
let supportsGeolocation: boolean | undefined;

/**
 * Como checkGeolocationSupport() de MapLibre: con la API de permisos, un
 * permiso ya denegado cuenta como «sin geolocalización».
 */
async function checkGeolocationSupport(): Promise<boolean> {
    const browser = navigator as Partial<Navigator>;

    if (supportsGeolocation !== undefined) {
        return supportsGeolocation;
    }

    if (browser.permissions === undefined) {
        supportsGeolocation = !!browser.geolocation;

        return supportsGeolocation;
    }

    try {
        supportsGeolocation = (await browser.permissions.query({ name: 'geolocation' })).state !== 'denied';
    } catch {
        supportsGeolocation = !!browser.geolocation;
    }

    return supportsGeolocation;
}

/**
 * GeolocateControl, como el de MapLibre 6: el botón con sus clases, su nombre
 * en inglés y su estado; el punto y el círculo de precisión; la cámara y los
 * eventos. Termina de armarse un momento después de añadirlo (pregunta por el
 * permiso sin pedirlo). Con `trackUserLocation` es un interruptor que sigue la
 * ubicación (watchPosition) y pasa a segundo plano cuando otro mueve la
 * cámara; sin él, una sola lectura. Un permiso denegado lo apaga y deshabilita
 * el botón. La ubicación la da `navigator.geolocation`.
 */
class FakeGeolocateControl implements FakeControl {
    readonly options: FakeGeolocateOptions;
    /** `_watchState` en MapLibre: sin seguimiento queda `undefined`. */
    watchState: WatchState | undefined;

    private map: FakeMap | undefined;
    private readonly container = document.createElement('div');
    private readonly button = document.createElement('button');
    private readonly dot = document.createElement('div');
    private readonly circle = document.createElement('div');
    private watchId: number | undefined;
    private lastKnownPosition: FakeGeolocationPosition | undefined;
    private setup = false;
    private listeners: { type: string; listener: Listener }[] = [];

    constructor(options: FakeGeolocateOptions = {}) {
        this.options = { ...GEOLOCATE_DEFAULTS, ...options };
    }

    onAdd(map: FakeMap): HTMLElement {
        this.map = map;
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this.button.className = 'maplibregl-ctrl-geolocate';
        this.button.type = 'button';
        this.button.disabled = true;

        const icon = document.createElement('span');
        icon.className = 'maplibregl-ctrl-icon';
        icon.setAttribute('aria-hidden', 'true');
        this.button.append(icon);
        this.container.append(this.button);

        void checkGeolocationSupport().then((supported) => {
            this.finishSetup(supported);
        });

        return this.container;
    }

    onRemove(): void {
        if (this.watchId !== undefined) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = undefined;
        }

        this.dot.remove();
        this.circle.remove();
        this.container.remove();
        this.map?.off('movestart', this.onMoveStart);
        this.map = undefined;
    }

    on(type: string, listener: Listener): this {
        this.listeners.push({ type, listener });

        return this;
    }

    off(type: string, listener: Listener): this {
        this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.listener !== listener);

        return this;
    }

    /** Como tocar el botón. */
    trigger(): boolean {
        if (!this.setup) {
            return false;
        }

        if (!this.options.trackUserLocation) {
            navigator.geolocation.getCurrentPosition(this.onSuccess, this.onError, this.options.positionOptions);

            return true;
        }

        switch (this.watchState) {
            case 'OFF':
                this.watchState = 'WAITING_ACTIVE';
                this.fire('trackuserlocationstart');
                break;
            case 'BACKGROUND':
                this.watchState = 'ACTIVE_LOCK';
                this.toggle('remove', 'background');

                if (this.lastKnownPosition) {
                    this.updateCamera(this.lastKnownPosition);
                }

                this.fire('trackuserlocationstart');
                this.fire('userlocationfocus');
                break;
            default:
                this.watchState = 'OFF';
                this.toggle('remove', 'waiting', 'active', 'active-error', 'background', 'background-error');
                this.fire('trackuserlocationend');
        }

        if (this.watchState === 'WAITING_ACTIVE') {
            this.toggle('add', 'waiting', 'active');
        } else if (this.watchState === 'ACTIVE_LOCK') {
            this.toggle('add', 'active');
        }

        if (this.watchState === 'OFF' && this.watchId !== undefined) {
            this.clearWatch();
        } else if (this.watchId === undefined) {
            this.toggle('add', 'waiting');
            this.button.setAttribute('aria-pressed', 'true');
            this.watchId = navigator.geolocation.watchPosition(this.onSuccess, this.onError, this.options.positionOptions);
        }

        return true;
    }

    private finishSetup(supported: boolean): void {
        const map = this.map;

        if (!map) {
            return;
        }

        const title = map._getUIString(supported ? 'GeolocateControl.FindMyLocation' : 'GeolocateControl.LocationNotAvailable');
        this.button.disabled = !supported;
        this.button.title = title;
        this.button.setAttribute('aria-label', title);

        if (this.options.trackUserLocation) {
            this.button.setAttribute('aria-pressed', 'false');
            this.watchState = 'OFF';
        }

        this.dot.className = 'maplibregl-user-location-dot';
        this.circle.className = 'maplibregl-user-location-accuracy-circle';
        this.button.addEventListener('click', () => {
            this.trigger();
        });
        this.setup = true;

        if (this.options.trackUserLocation) {
            map.on('movestart', this.onMoveStart);
        }
    }

    private readonly onSuccess = (position: FakeGeolocationPosition): void => {
        if (!this.map) {
            return;
        }

        if (this.isOutOfMaxBounds(position)) {
            this.setErrorState();
            this.fire('outofmaxbounds', { coords: position.coords, timestamp: position.timestamp });
            this.updateMarker(null);

            return;
        }

        if (this.options.trackUserLocation) {
            this.lastKnownPosition = position;

            if (this.watchState === 'BACKGROUND' || this.watchState === 'BACKGROUND_ERROR') {
                this.watchState = 'BACKGROUND';
                this.toggle('remove', 'waiting', 'background-error');
                this.toggle('add', 'background');
            } else {
                this.watchState = 'ACTIVE_LOCK';
                this.toggle('remove', 'waiting', 'active-error');
                this.toggle('add', 'active');
            }
        }

        if (this.options.showUserLocation && this.watchState !== 'OFF') {
            this.updateMarker(position);
        }

        if (!this.options.trackUserLocation || this.watchState === 'ACTIVE_LOCK') {
            this.updateCamera(position);
        }

        this.dot.classList.remove('maplibregl-user-location-dot-stale');
        this.fire('geolocate', { coords: position.coords, timestamp: position.timestamp });
    };

    private readonly onError = (error: FakeGeolocationError): void => {
        if (!this.map) {
            return;
        }

        if (error.code === 1) {
            this.watchState = 'OFF';
            this.toggle('remove', 'waiting', 'active', 'active-error', 'background', 'background-error');
            this.button.disabled = true;
            const title = this.map._getUIString('GeolocateControl.LocationNotAvailable');
            this.button.title = title;
            this.button.setAttribute('aria-label', title);

            if (this.watchId !== undefined) {
                this.clearWatch();
            }
        } else {
            this.setErrorState();
        }

        if (this.watchState !== 'OFF' && this.options.showUserLocation) {
            this.dot.classList.add('maplibregl-user-location-dot-stale');
        }

        this.fire('error', { code: error.code, message: error.message });
    };

    /** Otro movió la cámara (quien usa el mapa o la app): la ubicación queda, la cámara deja de seguirla. */
    private readonly onMoveStart = (event: unknown): void => {
        const fromLocate = (event as { geolocateSource?: boolean } | undefined)?.geolocateSource === true;

        if (this.map && !fromLocate && this.watchState === 'ACTIVE_LOCK' && !this.map.isZooming()) {
            this.watchState = 'BACKGROUND';
            this.toggle('add', 'background');
            this.toggle('remove', 'active');
            this.fire('trackuserlocationend');
            this.fire('userlocationlostfocus');
        }
    };

    private isOutOfMaxBounds({ coords }: FakeGeolocationPosition): boolean {
        const bounds = this.map?.getMaxBounds();

        return (
            !!bounds &&
            (coords.longitude < bounds.getWest() ||
                coords.longitude > bounds.getEast() ||
                coords.latitude < bounds.getSouth() ||
                coords.latitude > bounds.getNorth())
        );
    }

    private setErrorState(): void {
        if (this.watchState === 'WAITING_ACTIVE' || this.watchState === 'ACTIVE_LOCK') {
            if (this.watchState === 'ACTIVE_LOCK') {
                this.toggle('add', 'waiting');
            }

            this.watchState = 'ACTIVE_ERROR';
            this.toggle('remove', 'active');
            this.toggle('add', 'active-error');
        } else if (this.watchState === 'BACKGROUND') {
            this.watchState = 'BACKGROUND_ERROR';
            this.toggle('remove', 'background');
            this.toggle('add', 'background-error', 'waiting');
        }
    }

    /** Encuadra el círculo de precisión, con las opciones de `fitBoundsOptions`, sin pasar a segundo plano. */
    private updateCamera({ coords }: FakeGeolocationPosition): void {
        const latitude = coords.accuracy / 111_320;
        const longitude = latitude / Math.cos((coords.latitude * Math.PI) / 180);
        const bounds = [
            [coords.longitude - longitude, coords.latitude - latitude],
            [coords.longitude + longitude, coords.latitude + latitude],
        ];

        this.map?.fitBounds(bounds, { bearing: 0, ...this.options.fitBoundsOptions }, { geolocateSource: true });
    }

    private updateMarker(position: FakeGeolocationPosition | null): void {
        if (position && this.map) {
            const at = `${String(position.coords.longitude)},${String(position.coords.latitude)}`;
            this.dot.dataset.lngLat = at;
            this.circle.dataset.lngLat = at;
            this.map.getContainer().append(this.circle, this.dot);
        } else {
            this.dot.remove();
            this.circle.remove();
        }
    }

    private clearWatch(): void {
        if (this.watchId !== undefined) {
            navigator.geolocation.clearWatch(this.watchId);
        }

        this.watchId = undefined;
        this.toggle('remove', 'waiting');
        this.button.setAttribute('aria-pressed', 'false');
        this.updateMarker(null);
    }

    private toggle(action: 'add' | 'remove', ...states: string[]): void {
        this.button.classList[action](...states.map((state) => `maplibregl-ctrl-geolocate-${state}`));
    }

    private fire(type: string, data: Record<string, unknown> = {}): void {
        for (const { listener } of this.listeners.filter((entry) => entry.type === type)) {
            listener({ type, target: this, ...data });
        }
    }
}

/** Los textos en inglés que MapLibre pone por defecto (src/ui/default_locale.ts). */
const DEFAULT_UI_STRINGS: Readonly<Record<string, string>> = {
    'GeolocateControl.FindMyLocation': 'Find my location',
    'GeolocateControl.LocationNotAvailable': 'Location not available',
};

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
    readonly controls: FakeControl[] = [];
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
    // y, con getCenter() y getZoom(), que la cámara sigue donde estaba. Como
    // en MapLibre, cada movimiento avisa «movestart» con `eventData`.
    readonly jumpTo = vi.fn((camera: CameraChange, eventData?: Record<string, unknown>) => {
        this.moveCamera(camera, eventData ?? {});
    });
    readonly easeTo = vi.fn((camera: CameraChange, eventData?: Record<string, unknown>) => {
        this.moveCamera(camera, eventData ?? {});
    });
    readonly flyTo = vi.fn((camera: CameraChange, eventData?: Record<string, unknown>) => {
        this.moveCamera(camera, eventData ?? {});
    });
    readonly setCenter = vi.fn((center: unknown) => {
        this.moveCamera({ center }, {});
    });
    readonly setZoom = vi.fn((zoom: unknown) => {
        this.moveCamera({ zoom }, {});
    });
    readonly fitBounds = vi.fn((bounds: unknown, _options?: Record<string, unknown>, eventData?: Record<string, unknown>) => {
        // Sin proyección no hay centro que calcular: queda la marca de que se movió.
        this.moveCamera({ center: bounds }, eventData ?? {});
    });
    /** Como MapLibre: quita los controles (cada uno suelta lo suyo) y deja el contenedor vacío. */
    readonly remove = vi.fn(() => {
        for (const control of this.controls) {
            control.onRemove();
        }

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
        this.moveCamera(camera, {});
    }

    /** Los límites de la cámara (`maxBounds` de las opciones), como los da MapLibre. */
    getMaxBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number } | null {
        const bounds = this.options.maxBounds;

        if (!Array.isArray(bounds) || bounds.length !== 4) {
            return null;
        }

        const [west, south, east, north] = bounds as [number, number, number, number];

        return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north };
    }

    isZooming(): boolean {
        return false;
    }

    /** Un texto de la interfaz de MapLibre: en inglés, como viene. */
    _getUIString(key: string): string {
        return DEFAULT_UI_STRINGS[key] ?? key;
    }

    /** Con `eventData` (un movimiento de verdad, no el de un estilo), avisa «movestart». */
    private moveCamera(camera: CameraChange, eventData?: Record<string, unknown>): void {
        if (camera.center === undefined && camera.zoom === undefined) {
            return;
        }

        this.center = camera.center ?? this.center;
        this.zoom = camera.zoom ?? this.zoom;
        this.cameraUntouched = false;

        if (eventData) {
            this.fire('movestart', { ...eventData });
        }
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
     * aplica y avisa «style.load». Si hay otro esperando, MapLibre empieza a
     * cargarlo ahí mismo y suelta el que acaba de cargar antes de que su
     * aviso llegue al mapa: el mapa sigue sin estilo cargado y, de varios
     * estilos pedidos seguidos, solo avisa el último.
     */
    finishStyleLoad(): void {
        const next = this.pendingStyles.shift();

        if (!next) {
            return;
        }

        const previous = this.getStyle();
        this.applyStyle(next.options?.transformStyle ? next.options.transformStyle(previous, next.style) : next.style);
        this.styleLoaded = this.pendingStyles.length === 0;

        if (this.styleLoaded) {
            this.fire('style.load');
        }

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

    addControl(control: FakeControl): this {
        this.controls.push(control);
        this.container.append(control.onAdd(this));

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

export { FakeMap as Map, FakeNavigationControl as NavigationControl, FakeGeolocateControl as GeolocateControl, FakeSource as GeoJSONSource };

/** El siguiente `new Map()` lanza este error, como un navegador sin WebGL. */
export function failNextMap(error: Error): void {
    nextMapError = error;
}

/** Sin mapas, sin fallos pendientes y con las funciones espiadas sin llamadas. */
export function reset(): void {
    maps.length = 0;
    supportsGeolocation = undefined;
    nextMapError = null;
    addProtocol.mockReset();
    removeProtocol.mockReset();
    setWorkerUrl.mockReset();
}
