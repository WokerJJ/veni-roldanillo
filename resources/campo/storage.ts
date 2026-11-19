/*
| Lo que /campo guarda en el teléfono (ADR 0048): los borradores, un resumen
| de lo ya enviado y lo que hace falta para abrir sin señal (las categorías).
| Es IndexedDB, no localStorage: tiene más espacio, no bloquea y no se pierde
| tan fácil. Si el navegador no la deja usar (modo privado, datos de sitio
| bloqueados), los datos viven en memoria hasta cerrar la pantalla y la app lo
| avisa (`storageKind`): ahí un borrador sin enviar se perdería al cerrar.
|
| Nunca se guarda nada de la ubicación de la persona: el borrador tiene solo el
| punto del negocio que se confirmó.
*/

import type { Draft } from './draft';

export interface SentSummary {
    uuid: string;
    name: string;
    status: string;
    revision: number;
    received_at: string;
    owner_confirmed_at: string | null;
    link_expires_at: string | null;
    review_note: string | null;
    duplicates: number;
}

export interface Category {
    id: number;
    slug: string;
    name_es: string;
    name_en: string;
}

export interface MetaCache {
    /** La cuenta a la que pertenece lo guardado: si entra otra, se vacía todo. */
    userId: number;
    userName: string;
    categories: Category[];
    paymentMethods: string[];
}

type StoreName = 'drafts' | 'sent' | 'meta';

const DB_NAME = 'veni-campo';
const DB_VERSION = 1;

export type StorageKind = 'indexeddb' | 'memory';

export interface CampoStorage {
    readonly kind: StorageKind;
    listDrafts(): Promise<Draft[]>;
    putDraft(draft: Draft): Promise<void>;
    deleteDraft(uuid: string): Promise<void>;
    listSent(): Promise<SentSummary[]>;
    putSent(summary: SentSummary): Promise<void>;
    replaceSent(summaries: readonly SentSummary[]): Promise<void>;
    getMeta(): Promise<MetaCache | null>;
    putMeta(meta: MetaCache): Promise<void>;
    /** Borradores, enviados y meta: lo que dejó otra cuenta en este teléfono. */
    clearAll(): Promise<void>;
}

/** En memoria: lo que usa la app si IndexedDB no está, y las pruebas. */
export function memoryStorage(): CampoStorage {
    const drafts = new Map<string, Draft>();
    let sent = new Map<string, SentSummary>();
    let meta: MetaCache | null = null;

    return {
        kind: 'memory',
        listDrafts: () => Promise.resolve([...drafts.values()]),
        putDraft: (draft) => {
            drafts.set(draft.uuid, structuredClone(draft));

            return Promise.resolve();
        },
        deleteDraft: (uuid) => {
            drafts.delete(uuid);

            return Promise.resolve();
        },
        listSent: () => Promise.resolve([...sent.values()]),
        putSent: (summary) => {
            sent.set(summary.uuid, structuredClone(summary));

            return Promise.resolve();
        },
        replaceSent: (summaries) => {
            sent = new Map(summaries.map((summary) => [summary.uuid, structuredClone(summary)]));

            return Promise.resolve();
        },
        getMeta: () => Promise.resolve(meta),
        putMeta: (next) => {
            meta = structuredClone(next);

            return Promise.resolve();
        },
        clearAll: () => {
            drafts.clear();
            sent.clear();
            meta = null;

            return Promise.resolve();
        },
    };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            resolve(req.result);
        };
        req.onerror = () => {
            reject(req.error ?? new Error('IndexedDB falló.'));
        };
    });
}

function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            resolve();
        };
        tx.onerror = () => {
            reject(tx.error ?? new Error('IndexedDB falló.'));
        };
        tx.onabort = () => {
            reject(tx.error ?? new Error('IndexedDB se canceló.'));
        };
    });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const opening = factory.open(DB_NAME, DB_VERSION);

        opening.onupgradeneeded = () => {
            const db = opening.result;
            db.createObjectStore('drafts', { keyPath: 'uuid' });
            db.createObjectStore('sent', { keyPath: 'uuid' });
            db.createObjectStore('meta', { keyPath: 'key' });
        };
        opening.onsuccess = () => {
            resolve(opening.result);
        };
        opening.onerror = () => {
            reject(opening.error ?? new Error('No se pudo abrir IndexedDB.'));
        };
        opening.onblocked = () => {
            reject(new Error('IndexedDB está bloqueada.'));
        };
    });
}

/** IndexedDB si se puede usar; si no, memoria. */
export async function openStorage(given?: IDBFactory): Promise<CampoStorage> {
    const factory: IDBFactory | undefined = given ?? ('indexedDB' in globalThis ? globalThis.indexedDB : undefined);

    if (factory === undefined) {
        return memoryStorage();
    }

    let db: IDBDatabase;

    try {
        db = await openDatabase(factory);
    } catch {
        return memoryStorage();
    }

    const all = async <T>(name: StoreName): Promise<T[]> => (await request(db.transaction(name).objectStore(name).getAll())) as T[];
    const put = async (name: StoreName, value: unknown): Promise<void> => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).put(value);
        await done(tx);
    };

    return {
        kind: 'indexeddb',
        listDrafts: () => all<Draft>('drafts'),
        putDraft: (draft) => put('drafts', draft),
        deleteDraft: async (uuid) => {
            const tx = db.transaction('drafts', 'readwrite');
            tx.objectStore('drafts').delete(uuid);
            await done(tx);
        },
        listSent: () => all<SentSummary>('sent'),
        putSent: (summary) => put('sent', summary),
        replaceSent: async (summaries) => {
            const tx = db.transaction('sent', 'readwrite');
            const store = tx.objectStore('sent');
            store.clear();

            for (const summary of summaries) {
                store.put(summary);
            }

            await done(tx);
        },
        getMeta: async () => {
            const row = (await request(db.transaction('meta').objectStore('meta').get('cache'))) as { key: string; value: MetaCache } | undefined;

            return row?.value ?? null;
        },
        putMeta: (meta) => put('meta', { key: 'cache', value: meta }),
        clearAll: async () => {
            const tx = db.transaction(['drafts', 'sent', 'meta'], 'readwrite');
            tx.objectStore('drafts').clear();
            tx.objectStore('sent').clear();
            tx.objectStore('meta').clear();
            await done(tx);
        },
    };
}
