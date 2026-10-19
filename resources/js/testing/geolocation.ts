/**
 * La ubicación del dispositivo, de mentira: happy-dom no tiene la API
 * Geolocation (`navigator.geolocation` vale null). Pone una en `navigator`, con
 * el permiso que diga la prueba en la API de permisos, y la quita sola al
 * terminar la prueba. La prueba decide qué responde el dispositivo:
 *
 *     const device = stubGeolocation();
 *     device.move({ longitude: -76.1547, latitude: 4.4128 });
 *     device.fail(1); // sin permiso
 */
import { onTestFinished, vi } from 'vitest';

import type { FakeGeolocationError, FakeGeolocationPosition } from './maplibre';

interface Watcher {
    success: (position: FakeGeolocationPosition) => void;
    error?: ((error: FakeGeolocationError) => void) | undefined;
    options?: PositionOptions | undefined;
}

export interface Coordinates {
    longitude: number;
    latitude: number;
    /** Radio de precisión en metros. */
    accuracy?: number;
}

const MESSAGES: Readonly<Record<number, string>> = {
    1: 'User denied Geolocation',
    2: 'Position unavailable',
    3: 'Timeout expired',
};

/** Pone `value` en `navigator` por esta prueba, tapando el de happy-dom. */
function stubNavigator(property: 'geolocation' | 'permissions', value: unknown): void {
    Object.defineProperty(navigator, property, { value, configurable: true });
    onTestFinished(() => {
        Reflect.deleteProperty(navigator, property);
    });
}

/**
 * `permission` es lo que responde la API de permisos antes de que nadie pida
 * la ubicación: `prompt` (todavía no se preguntó), `granted` o `denied`.
 */
export function stubGeolocation({ permission = 'prompt' }: { permission?: PermissionState } = {}) {
    const watchers = new Map<number, Watcher>();
    let nextId = 1;

    const geolocation = {
        watchPosition: vi.fn((success: Watcher['success'], error?: Watcher['error'], options?: PositionOptions) => {
            const id = nextId;
            nextId += 1;
            watchers.set(id, { success, error, options });

            return id;
        }),
        clearWatch: vi.fn((id: number) => {
            watchers.delete(id);
        }),
        getCurrentPosition: vi.fn(),
    };

    stubNavigator('geolocation', geolocation);
    stubNavigator('permissions', { query: vi.fn(() => Promise.resolve({ state: permission })) });

    return {
        geolocation,
        /** Cuántas lecturas siguen abiertas (watchPosition sin clearWatch). */
        watching: () => watchers.size,
        /** Las opciones con que se pidió la última. */
        lastOptions: () => [...watchers.values()].at(-1)?.options,
        /** El dispositivo da una posición a quienes la están siguiendo. */
        move({ longitude, latitude, accuracy = 15 }: Coordinates): void {
            for (const { success } of [...watchers.values()]) {
                success({ coords: { longitude, latitude, accuracy }, timestamp: Date.now() });
            }
        },
        /** El dispositivo falla: 1, sin permiso; 2, sin posición; 3, tiempo agotado. */
        fail(code: 1 | 2 | 3): void {
            for (const { error } of [...watchers.values()]) {
                error?.({ code, message: MESSAGES[code] ?? '' });
            }
        },
    };
}

/** Un navegador sin la API Geolocation (o una página fuera de HTTPS, donde no existe). */
export function removeGeolocation(): void {
    stubNavigator('geolocation', undefined);
}
