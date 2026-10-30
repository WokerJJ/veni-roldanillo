import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetSentOrderIntents, ORDER_INTENT_DEDUPE_MS, recordOrderIntent } from '@/order/intent';

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
