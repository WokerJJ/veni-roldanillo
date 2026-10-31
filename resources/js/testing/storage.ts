import { type Mock, vi } from 'vitest';

/**
 * Para las pruebas: `localStorage` visto a través de un objeto cuyo `setItem`
 * se puede espiar o hacer fallar (sin espacio). happy-dom no pasa por
 * `Storage.prototype`, así que espiar ahí no ve nada. Lo demás va al
 * almacenamiento de verdad. Se deshace con `vi.restoreAllMocks()` o con el
 * `mockRestore()` del espía que devuelve.
 */
export function spyStorage(): { setItem: Mock<(key: string, value: string) => void>; restore: () => void } {
    const real = window.localStorage;
    const setItem = vi.fn((key: string, value: string): void => {
        real.setItem(key, value);
    });
    const fake = {
        getItem: (key: string) => real.getItem(key),
        setItem,
        removeItem: (key: string) => {
            real.removeItem(key);
        },
        key: (index: number) => real.key(index),
        clear: () => {
            real.clear();
        },
        get length() {
            return real.length;
        },
    };
    const getter = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(fake);

    return {
        setItem,
        restore: () => {
            getter.mockRestore();
        },
    };
}

/** Un `setItem` que falla como sin espacio. */
export function quotaExceeded(): never {
    throw new DOMException('Lleno', 'QuotaExceededError');
}
