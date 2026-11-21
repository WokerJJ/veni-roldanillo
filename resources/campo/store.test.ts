import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CampoApi, ServerSubmission } from './api';
import { AuthError, OfflineError, RejectedError } from './api';
import type { Catalog } from './catalog';
import type { Draft } from './draft';
import { newDraft } from './draft';
import { memoryStorage } from './storage';
import { createCampo } from './store';

function ready(uuid: string, overrides: Partial<Draft> = {}): Draft {
    return {
        ...newDraft(uuid, new Date('2026-11-18T15:00:00Z')),
        state: 'ready',
        name: 'Sazón del Parque',
        categoryIds: [1],
        address: 'Carrera 8 # 10-20',
        latitude: 4.412,
        longitude: -76.154,
        locationSource: 'device',
        delivery: false,
        ownerName: 'Marta Ríos',
        ownerPhone: '3004445566',
        purposeExplained: true,
        duplicates: [],
        ...overrides,
    };
}

function serverSubmission(uuid: string, overrides: Partial<ServerSubmission> = {}): ServerSubmission {
    return {
        uuid,
        name: 'Sazón del Parque',
        status: 'submitted',
        revision: 1,
        received_at: '2026-11-18T15:05:00Z',
        owner_confirmed_at: null,
        link_expires_at: null,
        review_note: null,
        duplicates: 0,
        ...overrides,
    };
}

function fakeApi(overrides: Partial<CampoApi> = {}): CampoApi {
    return {
        me: vi.fn(() => Promise.resolve({ user: { id: 1, name: 'Jhon' }, csrf: 't', categories: [{ id: 1, slug: 'pizzas', name_es: 'Pizzas', name_en: 'Pizza' }], payment_methods: ['cash'] })),
        duplicates: vi.fn(() => Promise.resolve([])),
        list: vi.fn(() => Promise.resolve([])),
        send: vi.fn((uuid: string) => Promise.resolve({ created: true, submission: serverSubmission(uuid) })),
        confirmationLink: vi.fn(() => Promise.resolve({ url: 'https://x.test/confirmar/abc', expires_at: null, whatsapp_url: 'https://wa.me/57300?text=hola' })),
        ...overrides,
    };
}

let storage = memoryStorage();
let counter = 0;

function build(api: CampoApi) {
    return createCampo({ api, storage, newUuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, now: () => new Date('2026-11-18T16:00:00Z') });
}

beforeEach(() => {
    storage = memoryStorage();
    counter = 0;
});

describe('borradores', () => {
    it('un borrador nuevo se guarda en el teléfono y se recupera al abrir', async () => {
        const campo = build(fakeApi());
        const draft = campo.createDraft();
        await campo.saveDraft({ ...draft, name: 'Mi local' });

        const reopened = build(fakeApi());
        await reopened.load();

        expect(reopened.state.drafts.map((d) => d.name)).toEqual(['Mi local']);
        expect(reopened.state.ready).toBe(true);
    });

    it('borrar quita el borrador del estado y del teléfono', async () => {
        const campo = build(fakeApi());
        const draft = campo.createDraft();
        await campo.removeDraft(draft.uuid);

        expect(campo.state.drafts).toEqual([]);
        expect(await storage.listDrafts()).toEqual([]);
    });
});

describe('enviar', () => {
    it('guardar un borrador que ya se envió no lo resucita (la pantalla guarda al cerrarse)', async () => {
        const campo = build(fakeApi());
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();
        const draft = JSON.parse(JSON.stringify(campo.state.drafts[0])) as Draft;

        await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        await campo.saveDraft(draft);

        expect(campo.state.drafts).toEqual([]);
        expect(await storage.listDrafts()).toEqual([]);
    });

    it('con señal, manda el cuerpo por el uuid, borra el borrador y deja el resumen enviado', async () => {
        const send = vi.fn((uuid: string) => Promise.resolve({ created: true, submission: serverSubmission(uuid) }));
        const campo = build(fakeApi({ send }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        const outcome = await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

        expect(outcome.kind).toBe('sent');
        expect(send).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expect.objectContaining({ owner_phone: '573004445566' }));
        expect(campo.state.drafts).toEqual([]);
        expect(campo.state.sent.map((s) => s.status)).toEqual(['submitted']);
        expect(await storage.listDrafts()).toEqual([]);
        expect((await storage.listSent()).length).toBe(1);
    });

    it('sin señal el borrador se queda en el teléfono y se avisa', async () => {
        const campo = build(fakeApi({ send: vi.fn(() => Promise.reject(new OfflineError('sin señal'))) }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        expect(await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({ kind: 'offline' });
        expect(campo.state.online).toBe(false);
        expect(campo.state.drafts).toHaveLength(1);
        expect(await storage.listDrafts()).toHaveLength(1);
    });

    it('sin sesión (401 o 419) no pierde nada y pide entrar', async () => {
        const campo = build(fakeApi({ send: vi.fn(() => Promise.reject(new AuthError('sin sesión'))) }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        expect(await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({ kind: 'auth' });
        expect(campo.state.auth).toBe('needed');
        expect(campo.state.drafts).toHaveLength(1);
    });

    it('un 422 marca el borrador con los campos que falló, sin borrarlo', async () => {
        const campo = build(fakeApi({ send: vi.fn(() => Promise.reject(new RejectedError(422, ['whatsapp', 'hours'], null))) }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        expect(await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({ kind: 'invalid', fields: ['whatsapp', 'hours'] });
        expect(campo.state.drafts[0]).toMatchObject({ state: 'error', serverErrors: ['whatsapp', 'hours'] });
    });

    it('un 409 (otro contenido con el mismo uuid) queda como error de conflicto', async () => {
        const campo = build(fakeApi({ send: vi.fn(() => Promise.reject(new RejectedError(409, [], 'content_conflict'))) }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        expect(await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({ kind: 'conflict' });
        expect(campo.state.drafts[0]?.serverErrors).toEqual(['conflict']);
    });

    it('un borrador incompleto no sale', async () => {
        const send = vi.fn();
        const campo = build(fakeApi({ send }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { name: '' }));
        await campo.load();

        expect(await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({ kind: 'incomplete' });
        expect(send).not.toHaveBeenCalled();
    });

    it('reintentar el mismo borrador usa el mismo uuid: el servidor no duplica', async () => {
        const send = vi.fn().mockRejectedValueOnce(new OfflineError('corte')).mockImplementation((uuid: string) => Promise.resolve({ created: false, submission: serverSubmission(uuid) }));
        const campo = build(fakeApi({ send }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();

        await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        await campo.sendDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

        expect(send.mock.calls.map((call) => String(call[0]))).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
        expect(campo.state.sent).toHaveLength(1);
    });
});

describe('enviar pendientes', () => {
    it('manda solo las listas y corta en cuanto falla la señal', async () => {
        const send = vi
            .fn()
            .mockImplementationOnce((uuid: string) => Promise.resolve({ created: true, submission: serverSubmission(uuid) }))
            .mockRejectedValueOnce(new OfflineError('corte'));
        const campo = build(fakeApi({ send }));

        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await storage.putDraft(ready('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { updatedAt: '2026-11-18T14:00:00Z' }));
        await storage.putDraft({ ...ready('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), state: 'editing' });
        await campo.load();

        const result = await campo.sendPending();

        expect(result).toEqual({ sent: 1, stoppedBy: 'offline' });
        expect(campo.state.drafts.map((d) => d.uuid).sort()).toEqual(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
        expect(campo.state.busy).toBe(false);
    });
});

describe('actualizar con señal', () => {
    it('guarda la sesión y las categorías para abrir sin señal, y trae los estados', async () => {
        const campo = build(fakeApi({ list: vi.fn(() => Promise.resolve([serverSubmission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { status: 'owner_confirmed' })])) }));
        await campo.refresh();

        expect(campo.state.auth).toBe('ok');
        expect(campo.state.sent.map((s) => s.status)).toEqual(['owner_confirmed']);
        expect((await storage.getMeta())?.categories).toHaveLength(1);

        const offline = build(fakeApi({ me: vi.fn(() => Promise.reject(new OfflineError('sin señal'))) }));
        await offline.load();
        await offline.refresh();

        expect(offline.state.meta?.userName).toBe('Jhon');
        expect(offline.state.online).toBe(false);
    });

    it('sin sesión lo marca y no toca los borradores', async () => {
        const campo = build(fakeApi({ me: vi.fn(() => Promise.reject(new AuthError('401'))) }));
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
        await campo.load();
        await campo.refresh();

        expect(campo.state.auth).toBe('needed');
        expect(campo.state.drafts).toHaveLength(1);
    });

    it('una captura devuelta vuelve como borrador para corregirla', async () => {
        const content = {
            name: 'Sazón', category_ids: [1], address: 'Calle 1 # 2-3', reference: null, phone: null, whatsapp: null, delivery: true, payment_methods: [], hours: [],
            latitude: 4.41, longitude: -76.15, location_source: 'device' as const, owner_name: 'Marta', owner_role: 'owner' as const, owner_phone: '573004445566', restaurant_id: null, distinct_from: [],
        };
        const campo = build(fakeApi({ list: vi.fn(() => Promise.resolve([serverSubmission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { status: 'returned', review_note: 'Falta algo', content })])) }));

        await campo.refresh();

        expect(campo.state.drafts[0]).toMatchObject({ uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', returnNote: 'Falta algo', name: 'Sazón' });
    });

    it('si el servidor la devolvió y el teléfono aún tiene el borrador viejo del mismo uuid, lo reemplaza por lo devuelto', async () => {
        const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const content = {
            name: 'Sazón devuelta', category_ids: [1], address: 'Calle 1 # 2-3', reference: null, phone: null, whatsapp: null, delivery: true, payment_methods: [], hours: [],
            latitude: 4.41, longitude: -76.15, location_source: 'device' as const, owner_name: 'Marta', owner_role: 'owner' as const, owner_phone: '573004445566', restaurant_id: null, distinct_from: [],
        };
        await storage.putDraft(ready(uuid, { name: 'Sazón vieja' }));
        const campo = build(fakeApi({ list: vi.fn(() => Promise.resolve([serverSubmission(uuid, { status: 'returned', review_note: 'Falta algo', content })])) }));
        await campo.load();

        await campo.refresh();

        expect(campo.state.drafts).toHaveLength(1);
        expect(campo.state.drafts[0]).toMatchObject({ uuid, name: 'Sazón devuelta', returnNote: 'Falta algo', state: 'editing' });
        expect((await storage.listDrafts())[0]?.name).toBe('Sazón devuelta');
    });

    it('un borrador que ya nació de la devolución y se está corrigiendo no se pisa al actualizar', async () => {
        const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const content = {
            name: 'Sazón devuelta', category_ids: [1], address: 'Calle 1 # 2-3', reference: null, phone: null, whatsapp: null, delivery: true, payment_methods: [], hours: [],
            latitude: 4.41, longitude: -76.15, location_source: 'device' as const, owner_name: 'Marta', owner_role: 'owner' as const, owner_phone: '573004445566', restaurant_id: null, distinct_from: [],
        };
        await storage.putDraft(ready(uuid, { name: 'Ya corregida', returnNote: 'Falta algo' }));
        const campo = build(fakeApi({ list: vi.fn(() => Promise.resolve([serverSubmission(uuid, { status: 'returned', review_note: 'Falta algo', content })])) }));
        await campo.load();

        await campo.refresh();

        expect(campo.state.drafts[0]?.name).toBe('Ya corregida');
    });
});

describe('un catálogo nuevo', () => {
    const dishOf = (variantId: number | null, price: number | null = 3500) => ({ name_es: variantId === null ? 'Jugo libre' : 'Manzana Postobón 400 ml', name_en: variantId === null ? null : 'Apple Postobón 400 ml', price, is_alcohol: false, catalog_variant_id: variantId });
    const catalogOf = (version: string, variantIds: number[]): Catalog => ({
        version,
        groups: [{ id: 1, slug: 'gaseosas', name_es: 'Gaseosas', name_en: null, section_name_es: 'Bebidas', section_name_en: null, is_alcohol: false, items: [{ id: 10, brand: null, name_es: 'Manzana', name_en: null, is_alcohol: false, variants: variantIds.map((id) => ({ id, label: `V${String(id)}` })) }] }],
    });
    const meOf = (catalog: Catalog) => () => Promise.resolve({ user: { id: 1, name: 'Jhon' }, csrf: 't', categories: [], payment_methods: [], catalog });

    it('si la versión cambia, los platos cuya presentación ya no existe pasan a platos libres y el envío no da 422', async () => {
        await storage.putMeta({ userId: 1, userName: 'Jhon', categories: [], paymentMethods: [], catalog: catalogOf('v1', [5, 6]) });
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { menu: [{ name_es: 'Bebidas', name_en: null, dishes: [dishOf(5), dishOf(6)] }] }));
        const campo = build(fakeApi({ me: vi.fn(meOf(catalogOf('v2', [6]))) }));
        await campo.load();
        await campo.refresh();

        const [gone, kept] = campo.state.drafts[0]?.menu[0]?.dishes ?? [];

        expect(gone).toEqual({ name_es: 'Manzana Postobón 400 ml', name_en: null, price: 3500, is_alcohol: false, catalog_variant_id: null });
        expect(kept?.catalog_variant_id).toBe(6);
        expect(kept?.name_en).toBe('Apple Postobón 400 ml');
        expect((await storage.listDrafts())[0]?.menu[0]?.dishes[0]?.catalog_variant_id).toBeNull();
    });

    it('si la versión es la misma, no toca los borradores', async () => {
        await storage.putMeta({ userId: 1, userName: 'Jhon', categories: [], paymentMethods: [], catalog: catalogOf('v1', [6]) });
        await storage.putDraft(ready('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { menu: [{ name_es: 'Bebidas', name_en: null, dishes: [dishOf(5)] }] }));
        const campo = build(fakeApi({ me: vi.fn(meOf(catalogOf('v1', [6]))) }));
        await campo.load();
        await campo.refresh();

        expect(campo.state.drafts[0]?.menu[0]?.dishes[0]?.catalog_variant_id).toBe(5);
    });
});

describe('cuentas distintas en el mismo teléfono', () => {
    const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('guarda el id de la cuenta en meta', async () => {
        const campo = build(fakeApi());
        await campo.refresh();

        expect((await storage.getMeta())?.userId).toBe(1);
    });

    it('si entra otra cuenta, vacía borradores, enviados y meta de la anterior antes de seguir', async () => {
        const first = build(fakeApi());
        await first.refresh();
        await storage.putDraft(ready(OTHER));
        await storage.putSent({ uuid: OTHER, name: 'De la cuenta 1', status: 'submitted', revision: 1, received_at: '2026-11-18T15:05:00Z', owner_confirmed_at: null, link_expires_at: null, review_note: null, duplicates: 0 });

        const second = build(fakeApi({
            me: vi.fn(() => Promise.resolve({ user: { id: 2, name: 'Otra' }, csrf: 't', categories: [], payment_methods: [] })),
            list: vi.fn(() => Promise.resolve([])),
        }));
        await second.load();
        expect(second.state.drafts).toHaveLength(1);

        await second.refresh();

        expect(second.state.drafts).toEqual([]);
        expect(second.state.sent).toEqual([]);
        expect(await storage.listDrafts()).toEqual([]);
        expect(await storage.listSent()).toEqual([]);
        expect(second.state.meta).toMatchObject({ userId: 2, userName: 'Otra' });
    });

    it('con la misma cuenta no borra nada', async () => {
        const campo = build(fakeApi());
        await campo.refresh();
        await storage.putDraft(ready(OTHER));

        const again = build(fakeApi());
        await again.load();
        await again.refresh();

        expect(again.state.drafts).toHaveLength(1);
    });
});

describe('enlace del dueño', () => {
    it('devuelve el enlace y actualiza los estados', async () => {
        const list = vi.fn(() => Promise.resolve([]));
        const campo = build(fakeApi({ list }));
        const link = await campo.ownerLink('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

        expect(link?.whatsapp_url).toContain('wa.me');
        expect(list).toHaveBeenCalled();
    });

    it('sin señal devuelve null y no revienta', async () => {
        const campo = build(fakeApi({ confirmationLink: vi.fn(() => Promise.reject(new OfflineError('sin señal'))) }));

        expect(await campo.ownerLink('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeNull();
        expect(campo.state.online).toBe(false);
    });
});

describe('duplicados', () => {
    it('sin señal devuelve null (el servidor los revisa al recibir)', async () => {
        const campo = build(fakeApi({ duplicates: vi.fn(() => Promise.reject(new OfflineError('sin señal'))) }));

        expect(await campo.checkDuplicates(ready('x'))).toBeNull();
        expect(campo.state.online).toBe(false);
    });

    it('no busca sin nombre ni punto', async () => {
        const duplicates = vi.fn();
        const campo = build(fakeApi({ duplicates }));

        expect(await campo.checkDuplicates(newDraft('x'))).toBeNull();
        expect(duplicates).not.toHaveBeenCalled();
    });
});
