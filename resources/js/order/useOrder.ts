import { computed, type ComputedRef, shallowRef } from 'vue';

import type { OrderItem } from './selection';
import { addItem, itemsCount, itemsTotal } from './selection';

/**
 * El pedido que se está armando, por restaurante (#14, ADR 0023). Vive en
 * la memoria de la pestaña: sobrevive a navegar dentro de la app (Inertia no
 * recarga la página), no a recargarla. Nada sale al servidor.
 *
 * Guardarlo en el dispositivo (para no perderlo al recargar) es decisión del
 * carrito (#15), que es el que lo muestra y lo vacía: guardar algo que la
 * persona todavía no puede ver ni borrar sería un dato suyo escondido.
 */
const orders = shallowRef<ReadonlyMap<string, readonly OrderItem[]>>(new Map());

export interface Order {
    items: ComputedRef<readonly OrderItem[]>;
    /** Unidades en total. */
    count: ComputedRef<number>;
    /** Total estimado, en pesos (sin domicilio). */
    total: ComputedRef<number>;
    /** Agrega el ítem y devuelve cuántas unidades entraron (al juntar líneas, no pasa de 20). */
    add: (item: OrderItem) => number;
    clear: () => void;
}

function update(slug: string, items: readonly OrderItem[]): void {
    const next = new Map(orders.value);

    if (items.length === 0) {
        next.delete(slug);
    } else {
        next.set(slug, items);
    }

    orders.value = next;
}

/** El pedido del restaurante `slug`. */
export function useOrder(slug: string): Order {
    const items = computed(() => orders.value.get(slug) ?? []);

    return {
        items,
        count: computed(() => itemsCount(items.value)),
        total: computed(() => itemsTotal(items.value)),
        add: (item) => {
            const before = itemsCount(items.value);
            const next = addItem(items.value, item);

            update(slug, next);

            return itemsCount(next) - before;
        },
        clear: () => {
            update(slug, []);
        },
    };
}

/** Solo para las pruebas: empezar sin pedidos. */
export function resetOrders(): void {
    orders.value = new Map();
}
