import type { DeliveryMode } from '@/order/checkout';

/**
 * El aviso de que se tocó «Enviar pedido por WhatsApp» (#22, ADR 0031):
 * POST /api/restaurants/{slug}/order-intents con {"fulfillment": …} y nada
 * más. Ni platos, ni total, ni dirección, ni nombre, ni ubicación, ni un
 * identificador: solo para las estadísticas del dueño.
 *
 * No frena ni demora el enlace a wa.me: no se espera la respuesta, y
 * keepalive deja que la petición termine aunque la página se vaya. Si falla
 * (sin señal, sin fetch) no pasa nada: el pedido sale igual.
 */
export const ORDER_INTENT_PATH = (slug: string): string => `/api/restaurants/${encodeURIComponent(slug)}/order-intents`;

/** Milisegundos en que un segundo toque al mismo restaurante no se vuelve a mandar. */
export const ORDER_INTENT_DEDUPE_MS = 10_000;

const lastSent = new Map<string, number>();

export function recordOrderIntent(slug: string, fulfillment: DeliveryMode, now: number = Date.now()): void {
    const previous = lastSent.get(slug);

    if (previous !== undefined && now - previous < ORDER_INTENT_DEDUPE_MS) {
        return;
    }

    lastSent.set(slug, now);

    if (typeof fetch !== 'function') {
        return;
    }

    try {
        void fetch(ORDER_INTENT_PATH(slug), {
            method: 'POST',
            keepalive: true,
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ fulfillment }),
        }).catch(() => undefined);
    } catch {
        // Un navegador que rechaza la petición: el pedido sale igual.
    }
}

/** Solo para las pruebas. */
export function forgetSentOrderIntents(): void {
    lastSent.clear();
}
