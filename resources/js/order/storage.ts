import { isRecord, readItem, text, writeItem } from '@/device/localStore';

import type { DeliveryMode } from './checkout';
import { ADDRESS_MAX_LENGTH, NAME_MAX_LENGTH, NEIGHBORHOOD_MAX_LENGTH, REFERENCE_MAX_LENGTH } from './checkout';
import type { ChosenOption, OrderItem } from './selection';
import { clampQuantity, NOTE_MAX_LENGTH } from './selection';

/**
 * Lo que el pedido guarda en el dispositivo (#15, ADR 0024), por restaurante
 * y con fecha de vencimiento, en `localStorage`:
 *
 * - el carrito (`veni:cart:<slug>`), un día desde el último cambio: un pedido
 *   es de hoy, y el menú y los precios cambian;
 * - los datos de entrega (`veni:delivery:<slug>`), solo si la persona marca
 *   «Recordar» y 90 días desde la última vez que los usó: modo, barrio,
 *   dirección, referencia y nombre. Desde la libreta de direcciones (#16,
 *   ADR 0032) ya no se escriben: el carrito los lee una vez, los pasa a la
 *   libreta (saved/addresses.ts) y los borra.
 *
 * Nunca la ubicación, el medio de pago ni «¿con cuánto pagás?». Nada de
 * esto sale del teléfono (regla 2 de producto). El almacenamiento puede
 * fallar (navegación privada, sin espacio, bloqueado): cada acceso va en
 * try/catch y sin él la app funciona igual, solo que no recuerda. Lo que se
 * lee se revisa campo por campo: puede venir de otra versión de la app o
 * estar tocado a mano.
 */

export const CART_PREFIX = 'veni:cart:';
export const DELIVERY_PREFIX = 'veni:delivery:';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CART_TTL_MS = DAY_MS;
export const DELIVERY_TTL_MS = 90 * DAY_MS;

/** Hasta cuántas líneas se leen: un carrito guardado no puede ser enorme. */
const MAX_LINES = 50;
const MAX_NAME_LENGTH = 200;
const MAX_PRICE = 10_000_000;

/** Los datos de entrega que se pueden recordar. */
export interface RememberedDelivery {
    mode: DeliveryMode;
    neighborhood: string;
    address: string;
    reference: string;
    name: string;
}

/** Un carrito leído del dispositivo y cuándo cambió por última vez. */
export interface SavedCart {
    items: OrderItem[];
    savedAt: number;
}

interface Stored {
    v: 1;
    savedAt: number;
    data: unknown;
}

function read(key: string): string | null {
    return readItem(key);
}

function write(key: string, value: string | null): void {
    writeItem(key, value);
}

function price(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE ? value : null;
}

/** El sobre con versión y fecha, si sigue vigente. */
function unwrap(raw: string | null, now: number, ttl: number): Stored | null {
    if (raw === null) {
        return null;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.savedAt !== 'number' || parsed.savedAt > now || now - parsed.savedAt > ttl) {
        return null;
    }

    return { v: 1, savedAt: parsed.savedAt, data: parsed.data };
}

function wrap(data: unknown, now: number): string {
    const stored: Stored = { v: 1, savedAt: now, data };

    return JSON.stringify(stored);
}

function parseChoice(value: unknown): ChosenOption | null {
    if (!isRecord(value)) {
        return null;
    }

    const group = text(value.group, MAX_NAME_LENGTH);
    const name = text(value.name, MAX_NAME_LENGTH);
    const cost = price(value.price);

    return group === null || name === null || cost === null ? null : { group, name, price: cost };
}

function parseItem(value: unknown): OrderItem | null {
    if (!isRecord(value) || !Array.isArray(value.choices) || !Array.isArray(value.removed)) {
        return null;
    }

    const dish = text(value.dish, MAX_NAME_LENGTH);
    const unitPrice = price(value.unitPrice);
    const choices = value.choices.map(parseChoice);
    const removed = value.removed.map((name) => text(name, MAX_NAME_LENGTH));
    const note = value.note === null ? null : text(value.note, NOTE_MAX_LENGTH);

    if (
        dish === null ||
        unitPrice === null ||
        typeof value.quantity !== 'number' ||
        (value.note !== null && note === null) ||
        choices.some((choice) => choice === null) ||
        removed.some((name) => name === null)
    ) {
        return null;
    }

    return {
        dish,
        unitPrice,
        quantity: clampQuantity(value.quantity),
        choices: choices.filter((choice): choice is ChosenOption => choice !== null),
        removed: removed.filter((name): name is string => name !== null),
        note,
    };
}

/** El carrito guardado, si sigue vigente y tiene forma de carrito; si no, null. Una línea dañada lo descarta entero. */
export function parseCart(raw: string | null, now: number): OrderItem[] | null {
    return parseSavedCart(raw, now)?.items ?? null;
}

/** Como parseCart, con la fecha del último cambio (para que venza también en la memoria). */
function parseSavedCart(raw: string | null, now: number): SavedCart | null {
    const stored = unwrap(raw, now, CART_TTL_MS);
    const data = stored?.data;

    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_LINES) {
        return null;
    }

    const items = data.map(parseItem);

    return stored !== null && items.every((item) => item !== null) ? { items, savedAt: stored.savedAt } : null;
}

/** Los datos de entrega guardados, si siguen vigentes; si no, null. */
export function parseDelivery(raw: string | null, now: number): RememberedDelivery | null {
    const data = unwrap(raw, now, DELIVERY_TTL_MS)?.data;

    if (!isRecord(data) || (data.mode !== 'delivery' && data.mode !== 'pickup')) {
        return null;
    }

    const neighborhood = text(data.neighborhood, NEIGHBORHOOD_MAX_LENGTH);
    const address = text(data.address, ADDRESS_MAX_LENGTH);
    const reference = text(data.reference, REFERENCE_MAX_LENGTH);
    const name = text(data.name, NAME_MAX_LENGTH);

    if (neighborhood === null || address === null || reference === null || name === null) {
        return null;
    }

    return { mode: data.mode, neighborhood, address, reference, name };
}

/** El carrito del restaurante; si venció o está dañado, se borra. */
export function loadCart(slug: string, now: number = Date.now()): OrderItem[] {
    return loadSavedCart(slug, now)?.items ?? [];
}

/** Como loadCart, con la fecha del último cambio; null si no hay carrito vigente. */
export function loadSavedCart(slug: string, now: number = Date.now()): SavedCart | null {
    const key = CART_PREFIX + slug;
    const raw = read(key);
    const saved = parseSavedCart(raw, now);

    if (saved === null && raw !== null) {
        write(key, null);
    }

    return saved;
}

/** Guarda el carrito (o lo borra si quedó vacío). */
export function saveCart(slug: string, items: readonly OrderItem[], now: number = Date.now()): void {
    write(CART_PREFIX + slug, items.length === 0 ? null : wrap(items, now));
}

export function loadDelivery(slug: string, now: number = Date.now()): RememberedDelivery | null {
    const key = DELIVERY_PREFIX + slug;
    const raw = read(key);
    const delivery = parseDelivery(raw, now);

    if (delivery === null && raw !== null) {
        write(key, null);
    }

    return delivery;
}

/** Guarda solo los cinco campos, aunque el objeto traiga más (la ubicación, el pago). */
export function saveDelivery(slug: string, delivery: RememberedDelivery, now: number = Date.now()): void {
    const { mode, neighborhood, address, reference, name } = delivery;

    write(DELIVERY_PREFIX + slug, wrap({ mode, neighborhood, address, reference, name }, now));
}

export function forgetDelivery(slug: string): void {
    write(DELIVERY_PREFIX + slug, null);
}
