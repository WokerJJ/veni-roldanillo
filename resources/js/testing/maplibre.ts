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

class FakeMap {
    readonly container: HTMLElement;
    readonly controls: FakeNavigationControl[] = [];
    readonly touchZoomRotate = { disableRotation: vi.fn() };
    readonly keyboard = { disableRotation: vi.fn() };
    readonly setStyle = vi.fn();
    // Lo que movería la cámara: las pruebas comprueban que nadie lo llama.
    readonly jumpTo = vi.fn();
    readonly easeTo = vi.fn();
    readonly flyTo = vi.fn();
    readonly setCenter = vi.fn();
    readonly setZoom = vi.fn();
    readonly fitBounds = vi.fn();
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
        maps.push(this);
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
