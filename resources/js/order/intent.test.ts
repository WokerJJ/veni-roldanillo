import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeliveryMode } from '@/order/checkout';
import { forgetSentOrderIntents, ORDER_INTENT_DEDUPE_MS, ORDER_INTENT_PATH, recordOrderIntent } from '@/order/intent';

import contract from '../../../tests/contracts/order-intent.request.json';

// Cada DeliveryMode, una vez: si se agrega uno, vue-tsc obliga a sumarlo aquí
// y la prueba de abajo, al contrato (y Pest, a Fulfillment).
const DELIVERY_MODES: Record<DeliveryMode, true> = { delivery: true, pickup: true };

describe('recordOrderIntent (#22, ADR 0031)', () => {
    beforeEach(() => {
        forgetSentOrderIntents();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('manda solo la entrega, en JSON, con keepalive y sin cookies', () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        vi.stubGlobal('fetch', fetchMock);

        recordOrderIntent('la ceiba', 'pickup');

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/restaurants/la%20ceiba/order-intents');
        expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
        expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
        expect(JSON.parse(init.body as string)).toStrictEqual({ fulfillment: 'pickup' });
    });

    it('manda el cuerpo de tests/contracts/order-intent.request.json, con los valores de DeliveryMode (EVA-012)', () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        vi.stubGlobal('fetch', fetchMock);

        expect(Object.keys(DELIVERY_MODES).sort()).toStrictEqual([...contract.body.fulfillment].sort());

        for (const [index, mode] of (Object.keys(DELIVERY_MODES) as DeliveryMode[]).entries()) {
            recordOrderIntent(`r${String(index)}`, mode);
        }

        expect(fetchMock).toHaveBeenCalledTimes(contract.body.fulfillment.length);
        for (const [index, call] of fetchMock.mock.calls.entries()) {
            const [url, init] = call as unknown as [string, RequestInit];
            const body = JSON.parse(init.body as string) as Record<string, unknown>;
            expect(url).toBe(contract.path.replace('{slug}', `r${String(index)}`));
            expect(url).toBe(ORDER_INTENT_PATH(`r${String(index)}`));
            expect(init.method).toBe(contract.method);
            expect(new Headers(init.headers).get('Content-Type')).toBe(contract.contentType);
            expect(Object.keys(body)).toStrictEqual(Object.keys(contract.body));
            expect(contract.body.fulfillment).toContain(body.fulfillment);
        }
    });

    it('un doble toque se manda una vez; pasados unos segundos, o a otro restaurante, otra vez', () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        vi.stubGlobal('fetch', fetchMock);

        recordOrderIntent('a', 'delivery', 1_000);
        recordOrderIntent('a', 'delivery', 1_500);
        recordOrderIntent('b', 'delivery', 1_600);
        recordOrderIntent('a', 'delivery', 1_000 + ORDER_INTENT_DEDUPE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('si la red falla o fetch lanza, no rompe nada', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('sin señal'))));
        expect(() => {
            recordOrderIntent('a', 'delivery');
        }).not.toThrow();

        vi.stubGlobal(
            'fetch',
            vi.fn(() => {
                throw new TypeError('keepalive no soportado');
            }),
        );
        expect(() => {
            recordOrderIntent('b', 'delivery');
        }).not.toThrow();

        await Promise.resolve();
    });
});
