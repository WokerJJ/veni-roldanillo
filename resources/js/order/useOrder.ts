import { computed, type ComputedRef, shallowRef } from 'vue';

import { removeWithPrefix } from '@/device/localStore';

import type { OrderItem } from './selection';
import { addItem, clampQuantity, itemsCount, itemsTotal } from './selection';
import { CART_PREFIX, CART_TTL_MS, loadSavedCart, parseCart, saveCart } from './storage';

/**
 * El pedido que se está armando, por restaurante (#14 y #15, ADR 0023 y
 * 0024). Vive en la memoria de la pestaña y se guarda en el dispositivo
 * (storage.ts) con cada cambio, un día desde el último: sobrevive a recargar
 * y a cerrar la app. Nada sale al servidor.
 *
 * Se lee del dispositivo la primera vez que se pide el pedido de un
 * restaurante en la pestaña; después manda la memoria, que sigue lo que
 * otras pestañas escriben (evento `storage`) y vence igual que lo guardado:
 * 24 h desde el último cambio, revisadas al pedir el pedido y al volver a la
 * pestaña.
 */
const orders = shallowRef<ReadonlyMap<string, readonly OrderItem[]>>(new Map());
const loaded = new Set<string>();
/** Cuándo cambió por última vez el pedido de cada restaurante, en milisegundos. */
const changedAt = new Map<string, number>();
let listening = false;

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

function set(slug: string, items: readonly OrderItem[], at: number): void {
    const next = new Map(orders.value);

    if (items.length === 0) {
        next.delete(slug);
        changedAt.delete(slug);
    } else {
        next.set(slug, items);
        changedAt.set(slug, at);
    }

    orders.value = next;
}

function update(slug: string, items: readonly OrderItem[]): void {
    const now = Date.now();

    set(slug, items, now);
    saveCart(slug, items, now);
}

/** Vacía el pedido si pasó un día desde el último cambio. */
function expire(slug: string, now: number = Date.now()): void {
    const at = changedAt.get(slug);

    if (at !== undefined && now - at > CART_TTL_MS) {
        update(slug, []);
    }
}

function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
        for (const slug of [...changedAt.keys()]) {
            expire(slug);
        }
    }
}

/** Otra pestaña cambió el carrito de un restaurante que esta ya tiene abierto. */
function onStorage(event: StorageEvent): void {
    if (event.key === null || !event.key.startsWith(CART_PREFIX)) {
        return;
    }

    const slug = event.key.slice(CART_PREFIX.length);

    if (loaded.has(slug)) {
        const now = Date.now();

        set(slug, parseCart(event.newValue, now) ?? [], now);
    }
}

function listen(): void {
    if (listening || typeof window === 'undefined') {
        return;
    }

    listening = true;
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
}

/** El pedido del restaurante `slug`. */
export function useOrder(slug: string): Order {
    listen();

    if (!loaded.has(slug)) {
        loaded.add(slug);

        const saved = loadSavedCart(slug);

        if (saved !== null && !orders.value.has(slug)) {
            set(slug, saved.items, saved.savedAt);
        }
    }

    expire(slug);

    const items = computed(() => orders.value.get(slug) ?? []);

    return {
        items,
        count: computed(() => itemsCount(items.value)),
        total: computed(() => itemsTotal(items.value)),
        add: (item) => {
            expire(slug);

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

/**
 * Vacía todos los pedidos sin enviar, en la memoria y en el dispositivo
 * («Borrar todo lo guardado», #16). Las pestañas abiertas que tengan uno lo
 * ven vaciarse por el evento `storage`.
 */
export function forgetAllOrders(): void {
    orders.value = new Map();
    changedAt.clear();
    removeWithPrefix(CART_PREFIX);
}

/** Solo para las pruebas: empezar sin pedidos, ni en memoria ni guardados. */
export function resetOrders(): void {
    forgetAllOrders();
    loaded.clear();
}
