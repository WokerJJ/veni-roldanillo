/**
 * Ayudas de las pruebas para lo que tiene que estar: fallan con un mensaje
 * claro en vez de seguir con `undefined` (y sin el `!` que ESLint no deja).
 */

/** El elemento `index` de la lista. */
export function nth<T>(list: readonly T[], index: number): T {
    const item = list[index];

    if (item === undefined) {
        throw new Error(`No hay elemento ${String(index)}: la lista tiene ${String(list.length)}.`);
    }

    return item;
}

/** El valor, que no puede ser null ni undefined. */
export function present<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('Se esperaba un valor.');
    }

    return value;
}
