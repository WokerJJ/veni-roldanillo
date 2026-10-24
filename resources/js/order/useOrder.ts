import { computed, type ComputedRef, shallowRef } from 'vue';

import type { OrderItem } from './selection';
import { addItem, clampQuantity, itemsCount, itemsTotal } from './selection';
import { CART_PREFIX, loadCart, saveCart } from './storage';

/**
 * El pedido que se está armando, por restaurante (#14 y #15, ADR 0023 y
 * 0024). Vive en la memoria de la pestaña y se guarda en el dispositivo
 * (storage.ts) con cada cambio, un día desde el último: sobrevive a recargar
 * y a cerrar la app. Nada sale al servidor.
 *
 * Se lee del dispositivo la primera vez que se pide el pedido de un
 * restaurante en la pestaña; después manda la memoria.
 */
const orders = shallowRef<ReadonlyMap<string, readonly OrderItem[]>>(new Map());
const loaded = new Set<string>();

export interface Order {
    items: ComputedRef<readonly OrderItem[]>;
    /** Unidades en total. */
    count: ComputedRef<number>;
    /** Total estimado, en pesos (sin domicilio). */
    total: ComputedRef<number>;
    /** Agrega el ítem y devuelve cuántas unidades entraron (al juntar líneas, no pasa de 20). */
    add: (item: OrderItem) => number;
    /** Cambia la cantidad de una línea (entre 1 y 20). */
    setQuantity: (index: number, quantity: number) => void;
    /** Quita una línea. */
    remove: (index: number) => void;
    clear: () => void;
}

function set(slug: string, items: readonly OrderItem[]): void {
    const next = new Map(orders.value);

    if (items.length === 0) {
        next.delete(slug);
    } else {
        next.set(slug, items);
    }

    orders.value = next;
}

function update(slug: string, items: readonly OrderItem[]): void {
    set(slug, items);
    saveCart(slug, items);
}

/** El pedido del restaurante `slug`. */
export function useOrder(slug: string): Order {
    if (!loaded.has(slug)) {
        loaded.add(slug);

        const saved = loadCart(slug);

        if (saved.length > 0 && !orders.value.has(slug)) {
            set(slug, saved);
        }
    }

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
        setQuantity: (index, quantity) => {
            update(
                slug,
                items.value.map((item, position) => (position === index ? { ...item, quantity: clampQuantity(quantity) } : item)),
            );
        },
        remove: (index) => {
            update(
                slug,
                items.value.filter((_, position) => position !== index),
            );
        },
        clear: () => {
            update(slug, []);
        },
    };
}

/** Solo para las pruebas: empezar sin pedidos, ni en memoria ni guardados. */
export function resetOrders(): void {
    orders.value = new Map();
    loaded.clear();

    try {
        for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith(CART_PREFIX)) {
                window.localStorage.removeItem(key);
            }
        }
    } catch {
        // Sin almacenamiento no hay nada que borrar.
    }
}
