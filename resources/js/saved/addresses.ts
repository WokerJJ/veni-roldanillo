import { computed, type ComputedRef, shallowRef } from 'vue';

import { isRecord, readItem, text, writeItem } from '@/device/localStore';
import { ADDRESS_MAX_LENGTH, NAME_MAX_LENGTH, NEIGHBORHOOD_MAX_LENGTH, REFERENCE_MAX_LENGTH } from '@/order/checkout';

/**
 * La libreta de direcciones (#16, ADR 0032): las direcciones de entrega que
 * la persona guarda en este teléfono, para todos los restaurantes. Cada una
 * con una etiqueta («Casa», «Trabajo» u otra que escribe), el barrio, la
 * dirección, la referencia y, si quiere, el nombre con que pide.
 *
 * Vive en `localStorage` (`veni:addresses`), en un sobre con versión, y nunca
 * sale del teléfono: aquí no hay ni una petición (regla 2 de producto). Nunca
 * guarda la ubicación, el medio de pago ni «¿con cuánto pagás?»: se copian
 * solo los campos de la libreta, aunque el objeto traiga más.
 *
 * Límites: 10 direcciones, cada campo con el largo del formulario del carrito
 * y un año desde la última vez que se usó; lo que pase de eso, no se lee. Una
 * dirección dañada se descarta sola, sin llevarse a las demás, y los
 * caracteres de control se quitan al guardar y al leer.
 */

export const ADDRESSES_KEY = 'veni:addresses';
export const MAX_ADDRESSES = 10;
export const LABEL_MAX_LENGTH = 30;
/** Un año desde la última vez que se usó (o se guardó). */
export const ADDRESS_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Lo más que se escribe de una dirección, sin contar el id ni la fecha. */
const FIELDS_MAX_LENGTH = LABEL_MAX_LENGTH + NEIGHBORHOOD_MAX_LENGTH + ADDRESS_MAX_LENGTH + REFERENCE_MAX_LENGTH + NAME_MAX_LENGTH;
/**
 * Lo más que se lee: diez direcciones con todos sus campos llenos entran
 * aunque cada carácter ocupe seis en el JSON (`\u0000`), más las claves.
 */
const MAX_RAW_LENGTH = MAX_ADDRESSES * (6 * FIELDS_MAX_LENGTH + 200);
const ID = /^[a-z0-9-]{1,40}$/;
/** Los caracteres de control (\u0000-\u001f, \u007f-\u009f): en una dirección no dicen nada. */
const CONTROL = /\p{Cc}/gu;

export type AddressLabelKind = 'home' | 'work' | 'other';

export interface AddressLabel {
    kind: AddressLabelKind;
    /** El nombre que escribe la persona, solo con «Otra». */
    text: string;
}

/** Lo que se escribe de una dirección: sin id ni fecha. */
export interface AddressFields {
    label: AddressLabel;
    neighborhood: string;
    address: string;
    reference: string;
    name: string;
}

export interface SavedAddress extends AddressFields {
    id: string;
    /** La última vez que se guardó o se usó, en milisegundos. */
    usedAt: number;
}

interface Stored {
    v: 1;
    data: SavedAddress[];
}

function withoutControl(value: string): string {
    return value.replace(CONTROL, '');
}

/** El texto, si es texto y no pasa de `max`, sin caracteres de control; si no, null. */
function field(value: unknown, max: number): string | null {
    const found = text(value, max);

    return found === null ? null : withoutControl(found);
}

function parseLabel(value: unknown): AddressLabel | null {
    if (!isRecord(value) || (value.kind !== 'home' && value.kind !== 'work' && value.kind !== 'other')) {
        return null;
    }

    const label = field(value.text, LABEL_MAX_LENGTH);

    return label === null ? null : { kind: value.kind, text: value.kind === 'other' ? label : '' };
}

function parseAddress(value: unknown, now: number): SavedAddress | null {
    if (!isRecord(value) || typeof value.id !== 'string' || !ID.test(value.id) || typeof value.usedAt !== 'number') {
        return null;
    }

    const label = parseLabel(value.label);
    const neighborhood = field(value.neighborhood, NEIGHBORHOOD_MAX_LENGTH);
    const address = field(value.address, ADDRESS_MAX_LENGTH);
    const reference = field(value.reference, REFERENCE_MAX_LENGTH);
    const name = field(value.name, NAME_MAX_LENGTH);

    if (label === null || neighborhood === null || address === null || reference === null || name === null) {
        return null;
    }

    // Vencida: no se lee. Con fecha del futuro (el reloj del teléfono se movió), queda como usada ahora.
    if (!Number.isFinite(value.usedAt) || now - value.usedAt > ADDRESS_TTL_MS) {
        return null;
    }

    return { id: value.id, label, neighborhood, address, reference, name, usedAt: Math.min(value.usedAt, now) };
}

/** Las direcciones guardadas que siguen vigentes y tienen forma de dirección; las demás, afuera. */
export function parseAddresses(raw: string | null, now: number): SavedAddress[] {
    if (raw === null || raw.length > MAX_RAW_LENGTH) {
        return [];
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!isRecord(parsed) || parsed.v !== 1 || !Array.isArray(parsed.data)) {
        return [];
    }

    const seen = new Set<string>();
    const addresses: SavedAddress[] = [];

    for (const value of parsed.data.slice(0, MAX_ADDRESSES)) {
        const address = parseAddress(value, now);

        if (address !== null && !seen.has(address.id)) {
            seen.add(address.id);
            addresses.push(address);
        }
    }

    return addresses;
}

/** Solo los campos de la libreta, sin caracteres de control y recortados a su largo: nunca la ubicación ni el pago. */
function clean(fields: AddressFields): AddressFields {
    const kind = fields.label.kind;

    return {
        label: { kind, text: kind === 'other' ? withoutControl(fields.label.text).trim().slice(0, LABEL_MAX_LENGTH) : '' },
        neighborhood: withoutControl(fields.neighborhood).slice(0, NEIGHBORHOOD_MAX_LENGTH),
        address: withoutControl(fields.address).slice(0, ADDRESS_MAX_LENGTH),
        reference: withoutControl(fields.reference).slice(0, REFERENCE_MAX_LENGTH),
        name: withoutControl(fields.name).slice(0, NAME_MAX_LENGTH),
    };
}

/** Siempre con las claves en el mismo orden: así lo leído se compara con lo que se escribiría. */
function serialize(addresses: readonly SavedAddress[]): string {
    const stored: Stored = {
        v: 1,
        data: addresses.map(({ id, label, neighborhood, address, reference, name, usedAt }) => ({
            id,
            label: { kind: label.kind, text: label.text },
            neighborhood,
            address,
            reference,
            name,
            usedAt,
        })),
    };

    return JSON.stringify(stored);
}

function newId(): string {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    return random.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || Date.now().toString(36);
}

/*
| En la memoria de la pestaña, compartida por el carrito y la pantalla de lo
| guardado: lo que cambia una se ve en la otra. Se lee del teléfono la
| primera vez que alguien la pide, y sigue lo que escriben otras pestañas
| (evento `storage`).
*/
const book = shallowRef<readonly SavedAddress[]>([]);
let loaded = false;
let listening = false;

function persist(next: readonly SavedAddress[]): void {
    book.value = next;
    writeItem(ADDRESSES_KEY, next.length === 0 ? null : serialize(next));
}

function onStorage(event: StorageEvent): void {
    // key null: otra pestaña vació todo el almacenamiento.
    if (event.key === ADDRESSES_KEY || event.key === null) {
        book.value = parseAddresses(event.newValue, Date.now());
    }
}

function ensureLoaded(): void {
    if (!loaded) {
        loaded = true;

        const raw = readItem(ADDRESSES_KEY);
        book.value = parseAddresses(raw, Date.now());

        // Con algo dañado o vencido: se reescribe solo con lo que vale. Si no vale
        // nada (otra versión, el reloj adelantado), queda como está: no se vacía.
        if (raw !== null && book.value.length > 0 && serialize(book.value) !== raw) {
            persist(book.value);
        }
    }

    if (!listening && typeof window !== 'undefined') {
        listening = true;
        window.addEventListener('storage', onStorage);
    }
}

export interface AddressBook {
    /** De la usada más recientemente a la más vieja. */
    addresses: ComputedRef<readonly SavedAddress[]>;
    full: ComputedRef<boolean>;
    /**
     * Guarda una dirección nueva (sin `id`) o cambia la que tiene ese id, y la
     * marca como usada ahora. Devuelve su id, o null si la libreta está llena.
     */
    save: (fields: AddressFields, id?: string | null, now?: number) => string | null;
    /** Marca como usada ahora la que tiene ese id, sin cambiarla (se envió un pedido con ella). */
    touch: (id: string, now?: number) => void;
    remove: (id: string) => void;
    clear: () => void;
}

export function useAddressBook(): AddressBook {
    ensureLoaded();

    const addresses = computed(() => [...book.value].sort((a, b) => b.usedAt - a.usedAt));

    return {
        addresses,
        full: computed(() => book.value.length >= MAX_ADDRESSES),
        save: (fields, id = null, now = Date.now()) => {
            const existing = id === null ? undefined : book.value.find((address) => address.id === id);

            if (existing === undefined && book.value.length >= MAX_ADDRESSES) {
                return null;
            }

            const saved: SavedAddress = { id: existing?.id ?? newId(), ...clean(fields), usedAt: now };

            persist(existing === undefined ? [...book.value, saved] : book.value.map((address) => (address.id === saved.id ? saved : address)));

            return saved.id;
        },
        touch: (id, now = Date.now()) => {
            if (book.value.some((address) => address.id === id)) {
                persist(book.value.map((address) => (address.id === id ? { ...address, usedAt: now } : address)));
            }
        },
        remove: (id) => {
            persist(book.value.filter((address) => address.id !== id));
        },
        clear: () => {
            persist([]);
        },
    };
}

/** Si la dirección con ese id quedó escrita en el teléfono, y no solo en la memoria de la pestaña. */
export function isStored(id: string): boolean {
    return parseAddresses(readItem(ADDRESSES_KEY), Date.now()).some((address) => address.id === id);
}

/** Solo para las pruebas: empezar con la libreta sin leer. */
export function resetAddressBook(): void {
    book.value = [];
    loaded = false;
}
