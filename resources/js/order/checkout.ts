import type { DeliveryZone, PaymentMethod } from '@/restaurants/profile';

import type { OrderItem } from './selection';
import { itemsTotal } from './selection';

/**
 * Los datos de entrega y pago del pedido (#15, ADR 0024) y lo que se calcula
 * con ellos: el costo del domicilio, el total estimado y qué falta antes de
 * enviar. Funciones puras, sin Vue: el carrito (OrderCart.vue) las usa, el
 * mensaje de WhatsApp (message.ts) también y las pruebas las fijan sin montar
 * nada.
 *
 * Nada de esto viaja al servidor: el pedido sale por WhatsApp (ADR 0004).
 */

/** Largos máximos de lo que se escribe a mano. */
export const ADDRESS_MAX_LENGTH = 120;
export const REFERENCE_MAX_LENGTH = 120;
export const NEIGHBORHOOD_MAX_LENGTH = 60;
export const NAME_MAX_LENGTH = 60;
/** «¿Con cuánto pagás?» no pasa de diez millones de pesos. */
export const CASH_MAX = 10_000_000;

export type DeliveryMode = 'delivery' | 'pickup';

/** Una posición que la persona pidió agregar al mensaje. Nunca se guarda ni sale del dispositivo, salvo en el texto que ella envía. */
export interface SharedLocation {
    latitude: number;
    longitude: number;
    /** Margen de error, en metros. */
    accuracy: number;
}

export interface OrderDetails {
    mode: DeliveryMode;
    /** El barrio: uno de las zonas del restaurante, o texto libre si no tiene zonas. */
    neighborhood: string;
    address: string;
    /** «Casa azul frente a la tienda». */
    reference: string;
    /** Opcional. */
    name: string;
    payment: PaymentMethod | null;
    /** «¿Con cuánto pagás?», en pesos; null si no lo dijo. Solo con efectivo. */
    cashAmount: number | null;
    location: SharedLocation | null;
}

/** Lo que el carrito necesita saber del restaurante. */
export interface OrderContext {
    deliveryAvailable: boolean;
    zones: readonly DeliveryZone[];
    paymentMethods: readonly PaymentMethod[];
}

export type DetailsField = 'neighborhood' | 'address' | 'payment' | 'cash';

export type DetailsProblem =
    /** Falta elegir el barrio de la lista. */
    | { field: 'neighborhood'; kind: 'missing' }
    /** Falta la dirección. */
    | { field: 'address'; kind: 'missing' }
    /** Falta el medio de pago. */
    | { field: 'payment'; kind: 'missing' }
    /** El efectivo no alcanza para el total que ya se conoce. */
    | { field: 'cash'; kind: 'short'; total: number };

export function emptyDetails(context: OrderContext): OrderDetails {
    return {
        mode: context.deliveryAvailable ? 'delivery' : 'pickup',
        neighborhood: '',
        address: '',
        reference: '',
        name: '',
        payment: context.paymentMethods.length === 1 ? (context.paymentMethods[0] ?? null) : null,
        cashAmount: null,
        location: null,
    };
}

/** Un texto de una línea: sin saltos ni espacios de más, recortado. */
export function cleanText(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Si va a domicilio: solo si el restaurante lo hace. */
export function isDelivery(details: OrderDetails, context: OrderContext): boolean {
    return context.deliveryAvailable && details.mode === 'delivery';
}

/** La zona del barrio elegido, si el restaurante tiene esa zona. */
export function zoneFor(context: OrderContext, neighborhood: string): DeliveryZone | null {
    return context.zones.find((zone) => zone.neighborhood === neighborhood) ?? null;
}

/**
 * El costo del domicilio: 0 al recoger en el local; el de la zona elegida;
 * null si todavía no se sabe (no eligió barrio, o el restaurante no publicó
 * zonas y lo confirma por WhatsApp).
 */
export function deliveryFee(details: OrderDetails, context: OrderContext): number | null {
    if (!isDelivery(details, context)) {
        return 0;
    }

    return zoneFor(context, details.neighborhood)?.fee ?? null;
}

/** El total estimado: platos más domicilio. `fee` null: el domicilio queda por confirmar. */
export function estimatedTotal(items: readonly OrderItem[], details: OrderDetails, context: OrderContext): { items: number; fee: number | null; total: number } {
    const dishes = itemsTotal(items);
    const fee = deliveryFee(details, context);

    return { items: dishes, fee, total: dishes + (fee ?? 0) };
}

/**
 * «¿Con cuánto pagás?» como lo escribe la persona («50.000», «50,000»,
 * «$ 50 000», «COP 50.000»): pesos enteros. El punto, la coma y el espacio
 * solo valen como separador de miles, en grupos de tres y siempre el mismo;
 * otra cosa es un decimal («50.5», «5,00») o un error, y da null en lugar de
 * un valor cien veces menor. null también si está vacío o no es un número.
 */
export function parseCash(value: string): number | null {
    const written = value
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(?:cop\s*)?\$?\s*/i, '');

    if (!/^(?:\d{1,8}|\d{1,3}(?:([., ])\d{3})(?:\1\d{3})*)$/.test(written)) {
        return null;
    }

    const amount = Number(written.replace(/[., ]/g, ''));

    return amount > 0 && amount <= CASH_MAX ? amount : null;
}

/** Lo que falta para enviar, en el orden del formulario. Vacío: se puede enviar. */
export function detailsProblems(items: readonly OrderItem[], details: OrderDetails, context: OrderContext): DetailsProblem[] {
    const problems: DetailsProblem[] = [];

    if (isDelivery(details, context)) {
        const neighborhood = cleanText(details.neighborhood, NEIGHBORHOOD_MAX_LENGTH);

        if (context.zones.length > 0 ? zoneFor(context, details.neighborhood) === null : neighborhood === '') {
            problems.push({ field: 'neighborhood', kind: 'missing' });
        }

        if (cleanText(details.address, ADDRESS_MAX_LENGTH) === '') {
            problems.push({ field: 'address', kind: 'missing' });
        }
    }

    if (context.paymentMethods.length > 0 && (details.payment === null || !context.paymentMethods.includes(details.payment))) {
        problems.push({ field: 'payment', kind: 'missing' });
    }

    if (details.payment === 'cash' && details.cashAmount !== null) {
        const { fee, total } = estimatedTotal(items, details, context);

        // Sin el domicilio confirmado solo se compara con los platos: el
        // restaurante sabrá si alcanza.
        if (details.cashAmount < (fee === null ? itemsTotal(items) : total)) {
            problems.push({ field: 'cash', kind: 'short', total });
        }
    }

    return problems;
}
