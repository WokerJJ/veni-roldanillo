/**
 * Doble de maplibre-gl para Vitest: happy-dom no tiene WebGL. Reproduce lo
 * que usa resources/js/map/engine.ts (el mapa, sus eventos y los botones de
 * zoom con las clases de MapLibre) y deja a la vista lo que la app le pide.
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

class FakeMap {
    readonly container: HTMLElement;
    readonly controls: FakeNavigationControl[] = [];
    readonly touchZoomRotate = { disableRotation: vi.fn() };
    readonly keyboard = { disableRotation: vi.fn() };

    // La cámara, como en MapLibre: arranca en 0,0 con zoom 0 y «sin tocar»
    // hasta que algo la mueve (las opciones, la app o quien usa el mapa).
    private center: unknown = [0, 0];
    private zoom: unknown = 0;
    private cameraUntouched = true;

    /**
     * Como MapLibre cada vez que carga un estilo: el `center` y el `zoom` del
     * estilo mandan solo mientras nadie haya tocado la cámara. Por eso cambiar
     * de estilo no devuelve el mapa al centro del pueblo.
     */
    readonly setStyle = vi.fn((style: CameraChange) => {
        if (this.cameraUntouched) {
            this.moveCamera(style);
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
            this.setStyle(options.style);
            this.setStyle.mockClear();
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

export { FakeMap as Map, FakeNavigationControl as NavigationControl };

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
