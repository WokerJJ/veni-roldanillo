import { describe, expect, it, vi } from 'vitest';

import { AuthError, createApi, OfflineError, RejectedError } from './api';

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ME = { user: { name: 'Jhon' }, csrf: 'token-1', categories: [], payment_methods: [] };

describe('createApi', () => {
    it('manda la sesión, JSON y el token CSRF que dio /me', async () => {
        const doFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(json(200, ME)).mockResolvedValueOnce(json(201, { uuid: 'u', name: 'x' }));
        const api = createApi(doFetch);

        await api.me();
        const { created } = await api.send('u', { name: 'x' } as never);

        const [, init] = doFetch.mock.calls[1] ?? [];
        expect(created).toBe(true);
        expect(doFetch.mock.calls[1]?.[0]).toBe('/campo/api/submissions/u');
        expect(init).toMatchObject({ method: 'PUT', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'token-1' } });
    });

    it('un 200 al reenviar es «no creó» (el servidor ya la tenía)', async () => {
        const api = createApi(vi.fn<typeof fetch>().mockResolvedValue(json(200, { uuid: 'u' })));

        expect((await api.send('u', {} as never)).created).toBe(false);
    });

    it('sin red lanza OfflineError, también ante un 5xx o un límite', async () => {
        await expect(createApi(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))).me()).rejects.toBeInstanceOf(OfflineError);
        await expect(createApi(vi.fn<typeof fetch>().mockResolvedValue(json(503, {}))).me()).rejects.toBeInstanceOf(OfflineError);
        await expect(createApi(vi.fn<typeof fetch>().mockResolvedValue(json(429, {}))).list()).rejects.toBeInstanceOf(OfflineError);
    });

    it('un 401 o un 403 es falta de sesión de administración', async () => {
        await expect(createApi(vi.fn<typeof fetch>().mockResolvedValue(json(401, {}))).me()).rejects.toBeInstanceOf(AuthError);
        await expect(createApi(vi.fn<typeof fetch>().mockResolvedValue(json(403, {}))).list()).rejects.toBeInstanceOf(AuthError);
    });

    it('un 419 pide un token nuevo y reintenta una sola vez', async () => {
        const doFetch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(json(419, {}))
            .mockResolvedValueOnce(json(200, { ...ME, csrf: 'token-2' }))
            .mockResolvedValueOnce(json(200, { uuid: 'u' }));

        await createApi(doFetch).send('u', {} as never);

        expect(doFetch.mock.calls.map((call) => call[0])).toEqual(['/campo/api/submissions/u', '/campo/api/me', '/campo/api/submissions/u']);
        expect((doFetch.mock.calls[2]?.[1]?.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('token-2');
    });

    it('si el 419 sigue después del reintento, es falta de sesión', async () => {
        const doFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(json(419, {})).mockResolvedValueOnce(json(200, ME)).mockResolvedValueOnce(json(419, {}));

        await expect(createApi(doFetch).send('u', {} as never)).rejects.toBeInstanceOf(AuthError);
    });

    it('un 422 trae los campos que falló, y un 409 su motivo', async () => {
        const invalid = createApi(vi.fn<typeof fetch>().mockResolvedValue(json(422, { message: 'x', errors: { whatsapp: ['mal'], hours: ['mal'] } })));
        const conflict = createApi(vi.fn<typeof fetch>().mockResolvedValue(json(409, { message: 'content_conflict', errors: {} })));

        await expect(invalid.send('u', {} as never)).rejects.toMatchObject({ status: 422, fields: ['whatsapp', 'hours'] });
        await expect(conflict.send('u', {} as never)).rejects.toMatchObject({ status: 409, reason: 'content_conflict' });
        await expect(conflict.send('u', {} as never)).rejects.toBeInstanceOf(RejectedError);
    });

    it('busca duplicados con el uuid para no contarse a sí misma', async () => {
        const doFetch = vi.fn<typeof fetch>().mockResolvedValue(json(200, { candidates: [{ name: 'Otro' }] }));

        const found = await createApi(doFetch).duplicates('Sazón', 4.41, -76.15, 'u');

        expect(found).toEqual([{ name: 'Otro' }]);
        expect(JSON.parse(doFetch.mock.calls[0]?.[1]?.body as string)).toEqual({ name: 'Sazón', latitude: 4.41, longitude: -76.15, uuid: 'u' });
    });
});
