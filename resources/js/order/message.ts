import type { TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';
import type { PaymentMethod } from '@/restaurants/profile';

import type { OrderContext, OrderDetails, SharedLocation } from './checkout';
import { ADDRESS_MAX_LENGTH, cleanText, estimatedTotal, isDelivery, NAME_MAX_LENGTH, NEIGHBORHOOD_MAX_LENGTH, REFERENCE_MAX_LENGTH } from './checkout';
import type { OrderItem } from './selection';

/**
 * El mensaje del pedido por WhatsApp y el enlace que lo abre (#15, ADR 0004 y
 * 0024). Funciones puras: el idioma y el formato de los pesos llegan de
 * afuera (el de la interfaz), y con los mismos datos el texto es siempre el
 * mismo, letra por letra.
 *
 * El mensaje es lo único que lleva los datos del pedido fuera del teléfono, y
 * lo envía la persona desde su WhatsApp: Vení no lo recibe.
 */

export type Translate = (key: TranslationKey, replacements?: Replacements) => string;
export type FormatMoney = (amount: number) => string;

const PAYMENT_KEYS: Readonly<Record<PaymentMethod, TranslationKey>> = {
    cash: 'restaurant.payment.cash',
    nequi: 'restaurant.payment.nequi',
    daviplata: 'restaurant.payment.daviplata',
    card: 'restaurant.payment.card',
};

/**
 * El número para wa.me: `57` y diez dígitos. La ficha ya lo manda así; si
 * llega con espacios, `+` o sin el indicativo (diez dígitos), se arregla. Lo
 * demás es null: sin un número que sirva, el pedido por WhatsApp no se ofrece.
 */
export function whatsappNumber(raw: string | null): string | null {
    const digits = (raw ?? '').replace(/[\s()+-]/g, '');

    if (/^57\d{10}$/.test(digits)) {
        return digits;
    }

    return /^\d{10}$/.test(digits) ? `57${digits}` : null;
}

/** `https://wa.me/<numero>?text=<mensaje codificado>`: abre el chat con el mensaje escrito, sin enviarlo. */
export function whatsappUrl(number: string, text: string): string {
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * La ubicación como un enlace universal de Google Maps, sin API ni clave (ADR
 * 0008), que el restaurante abre en su teléfono. Con cinco decimales: un
 * metro, más fino que lo que mide un celular.
 */
export function locationUrl(location: Pick<SharedLocation, 'latitude' | 'longitude'>): string {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}

/** «2 × Hamburguesa + Queso + Tocineta, sin Cebolla, Tomate — $ 49.000», con la nota debajo. */
function itemLines(item: OrderItem, t: Translate, money: FormatMoney): string[] {
    let dish = item.dish + item.choices.map((choice) => ` + ${choice.name}`).join('');

    if (item.removed.length > 0) {
        dish += `, ${t('order.message.without', { names: item.removed.join(', ') })}`;
    }

    const lines = [t('order.message.line', { quantity: item.quantity, dish, price: money(item.unitPrice * item.quantity) })];

    if (item.note !== null) {
        lines.push(t('order.message.note', { note: item.note }));
    }

    return lines;
}

/**
 * El mensaje completo. Va en bloques separados por una línea en blanco: los
 * platos, las cuentas («Total estimado») y cómo se entrega y se paga. Lo
 * escrito a mano sale en una línea, sin espacios de más.
 */
export function orderMessage(items: readonly OrderItem[], details: OrderDetails, context: OrderContext, t: Translate, money: FormatMoney): string {
    const delivery = isDelivery(details, context);
    const { items: dishes, fee, total } = estimatedTotal(items, details, context);
    const neighborhood = cleanText(details.neighborhood, NEIGHBORHOOD_MAX_LENGTH);

    const blocks: string[][] = [[t('order.message.greeting'), ...items.flatMap((item) => itemLines(item, t, money))]];

    const totals: string[] = [];

    if (delivery) {
        totals.push(t('order.message.subtotal', { amount: money(dishes) }));
        totals.push(
            fee === null ? t('order.message.delivery_pending') : t('order.message.delivery_fee', { neighborhood, amount: money(fee) }),
        );
    }

    totals.push(t(fee === null ? 'order.message.total_plus_delivery' : 'order.message.total', { amount: money(total) }));
    blocks.push(totals);

    const handoff: string[] = [t(delivery ? 'order.message.mode_delivery' : 'order.message.mode_pickup')];
    const optional = (key: TranslationKey, value: string): void => {
        if (value !== '') {
            handoff.push(t(key, { value }));
        }
    };

    if (delivery) {
        optional('order.message.neighborhood', neighborhood);
        optional('order.message.address', cleanText(details.address, ADDRESS_MAX_LENGTH));
        optional('order.message.reference', cleanText(details.reference, REFERENCE_MAX_LENGTH));
    }

    optional('order.message.name', cleanText(details.name, NAME_MAX_LENGTH));

    if (details.payment !== null) {
        const method = t(PAYMENT_KEYS[details.payment]);

        handoff.push(
            details.payment === 'cash' && details.cashAmount !== null
                ? t('order.message.payment_cash_with', { method, amount: money(details.cashAmount) })
                : t('order.message.payment', { method }),
        );
    }

    // La ubicación solo sirve para llevar el pedido: al recoger no se manda.
    if (delivery && details.location !== null) {
        handoff.push(t('order.message.location', { url: locationUrl(details.location) }));
    }

    blocks.push(handoff);

    return blocks.map((lines) => lines.join('\n')).join('\n\n');
}
