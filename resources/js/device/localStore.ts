/**
 * Acceso a `localStorage` que nunca falla (ADR 0015, 0024 y 0032): lo usan el
 * carrito, los datos de entrega, la libreta de direcciones y los favoritos.
 *
 * El almacenamiento puede no estar (navegación privada, bloqueado, sin
 * espacio): cada acceso va en try/catch y, sin él, la app funciona igual,
 * solo que no recuerda. Lo que se lee se revisa antes de usarlo: puede venir
 * de otra versión de la app o estar tocado a mano. Nada de esto sale del
 * teléfono: aquí no hay ni una petición.
 */

function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function readItem(key: string): string | null {
    try {
        return storage()?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

/** Escribe (o borra, con null). Devuelve si quedó escrito. */
export function writeItem(key: string, value: string | null): boolean {
    try {
        const store = storage();

        if (store === null) {
            return false;
        }

        if (value === null) {
            store.removeItem(key);
        } else {
            store.setItem(key, value);
        }

        return true;
    } catch {
        // Sin espacio o bloqueado: no se recuerda, y nada más.
        return false;
    }
}

/** Borra todas las claves que empiezan con `prefix`. */
export function removeWithPrefix(prefix: string): void {
    try {
        const store = storage();

        if (store === null) {
            return;
        }

        const keys: string[] = [];

        for (let index = 0; index < store.length; index++) {
            const key = store.key(index);

            if (key?.startsWith(prefix) === true) {
                keys.push(key);
            }
        }

        keys.forEach((key) => {
            store.removeItem(key);
        });
    } catch {
        // Sin almacenamiento no hay nada que borrar.
    }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El texto, si es texto y no pasa de `max`; si no, null. */
export function text(value: unknown, max: number): string | null {
    return typeof value === 'string' && value.length <= max ? value : null;
}
