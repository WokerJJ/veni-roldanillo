/*
| El estado de /campo y el envío (ADR 0048): los borradores del teléfono, lo
| ya enviado y qué hacer cuando falla la señal o la sesión. Los borradores se
| guardan en el dispositivo con cada cambio y se envían con `PUT` por su uuid:
| repetir el envío no duplica, así que reintentar es seguro.
*/

import { reactive } from 'vue';

import type { CampoApi, ConfirmationLink, ServerSubmission } from './api';
import { AuthError, OfflineError, RejectedError } from './api';
import type { Candidate, Draft } from './draft';
import { draftFromReturned, firstInvalidStep, newDraft, toBody } from './draft';
import type { CampoStorage, MetaCache, SentSummary, StorageKind } from './storage';

export type AuthState = 'unknown' | 'ok' | 'needed';

export type SendOutcome =
    | { kind: 'sent'; summary: SentSummary }
    | { kind: 'offline' }
    | { kind: 'auth' }
    | { kind: 'invalid'; fields: string[] }
    | { kind: 'conflict' }
    | { kind: 'incomplete' };

export interface CampoState {
    ready: boolean;
    drafts: Draft[];
    sent: SentSummary[];
    meta: MetaCache | null;
    auth: AuthState;
    online: boolean;
    busy: boolean;
    storageKind: StorageKind;
}

export interface CampoDeps {
    api: CampoApi;
    storage: CampoStorage;
    newUuid: () => string;
    now?: () => Date;
}

/** Una copia sin proxies de Vue: IndexedDB y structuredClone no aceptan un objeto reactivo. */
function plain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function summaryOf(server: ServerSubmission): SentSummary {
    return {
        uuid: server.uuid,
        name: server.name,
        status: server.status,
        revision: server.revision,
        received_at: server.received_at,
        owner_confirmed_at: server.owner_confirmed_at,
        link_expires_at: server.link_expires_at,
        review_note: server.review_note,
        duplicates: Array.isArray(server.duplicates) ? server.duplicates.length : 0,
    };
}

export function createCampo(deps: CampoDeps) {
    const { api, storage } = deps;
    const now = deps.now ?? (() => new Date());

    const state = reactive<CampoState>({
        ready: false,
        drafts: [],
        sent: [],
        meta: null,
        auth: 'unknown',
        online: true,
        busy: false,
        storageKind: storage.kind,
    });

    function draftIndex(uuid: string): number {
        return state.drafts.findIndex((draft) => draft.uuid === uuid);
    }

    function byRecent(a: { updatedAt?: string; received_at?: string }, b: { updatedAt?: string; received_at?: string }): number {
        return (b.updatedAt ?? b.received_at ?? '').localeCompare(a.updatedAt ?? a.received_at ?? '');
    }

    /** Lo que había en el teléfono. */
    async function load(): Promise<void> {
        state.drafts = (await storage.listDrafts()).sort(byRecent);
        state.sent = (await storage.listSent()).sort(byRecent);
        state.meta = await storage.getMeta();
        state.ready = true;
    }

    async function putDraft(draft: Draft): Promise<void> {
        const index = draftIndex(draft.uuid);

        if (index === -1) {
            state.drafts.unshift(draft);
        } else {
            state.drafts[index] = draft;
        }

        await storage.putDraft(plain(draft));
    }

    /** Con señal: la sesión, las categorías y el estado de lo enviado. */
    async function refresh(): Promise<void> {
        try {
            const me = await api.me();
            state.auth = 'ok';
            state.online = true;

            // Otra cuenta en el mismo teléfono: lo guardado no es suyo ni se le muestra ni se le envía.
            const previous = await storage.getMeta();

            if (previous?.userId !== undefined && previous.userId !== me.user.id) {
                await storage.clearAll();
                state.drafts = [];
                state.sent = [];
                state.meta = null;
            }

            state.meta = { userId: me.user.id, userName: me.user.name, categories: me.categories, paymentMethods: me.payment_methods, ...(me.catalog ? { catalog: me.catalog } : {}) };
            await storage.putMeta(plain(state.meta));

            const server = await api.list();
            state.sent = server.map(summaryOf).sort(byRecent);
            await storage.replaceSent(plain(state.sent));

            // Una captura devuelta vuelve como borrador para corregirla. Si el teléfono
            // aún tiene el borrador viejo del mismo uuid (el que se envió y administración
            // devolvió), se reemplaza por lo devuelto: reenviarlo igual lo rechaza el
            // servidor. El que ya nació de la devolución (tiene su nota) se está corrigiendo
            // y no se pisa.
            for (const item of server) {
                if (item.status !== 'returned' || !item.content) {
                    continue;
                }

                const local = state.drafts[draftIndex(item.uuid)];

                if (local === undefined || local.returnNote === null) {
                    await putDraft(draftFromReturned(item.uuid, item.content, item.review_note, now()));
                }
            }
        } catch (error) {
            if (error instanceof AuthError) {
                state.auth = 'needed';
            } else if (error instanceof OfflineError) {
                state.online = false;
            } else {
                throw error;
            }
        }
    }

    function createDraft(): Draft {
        const draft = newDraft(deps.newUuid(), now());
        state.drafts.unshift(draft);
        void storage.putDraft(plain(draft));

        return draft;
    }

    /** Guarda los cambios de un borrador que existe: uno ya enviado o borrado no resucita (la pantalla guarda al cerrarse). */
    async function saveDraft(draft: Draft): Promise<void> {
        if (draftIndex(draft.uuid) === -1) {
            return;
        }

        await putDraft({ ...draft, updatedAt: now().toISOString() });
    }

    async function removeDraft(uuid: string): Promise<void> {
        state.drafts = state.drafts.filter((draft) => draft.uuid !== uuid);
        await storage.deleteDraft(uuid);
    }

    /** Busca fichas parecidas con señal; sin ella deja `duplicates` en null (se revisan en el servidor). */
    async function checkDuplicates(draft: Draft): Promise<Candidate[] | null> {
        if (draft.latitude === null || draft.longitude === null || draft.name.trim().length < 2) {
            return null;
        }

        try {
            const found = await api.duplicates(draft.name.trim(), draft.latitude, draft.longitude, draft.uuid);
            state.online = true;

            return found;
        } catch (error) {
            if (error instanceof OfflineError) {
                state.online = false;

                return null;
            }

            if (error instanceof AuthError) {
                state.auth = 'needed';

                return null;
            }

            throw error;
        }
    }

    /** Envía un borrador terminado. El borrador se borra del teléfono solo cuando el servidor lo recibe. */
    async function sendDraft(uuid: string): Promise<SendOutcome> {
        const draft = state.drafts[draftIndex(uuid)];

        if (!draft || firstInvalidStep(draft) !== null) {
            return { kind: 'incomplete' };
        }

        try {
            const { submission } = await api.send(uuid, toBody(draft));
            state.online = true;
            state.auth = 'ok';
            const summary = summaryOf(submission);
            state.sent = [summary, ...state.sent.filter((item) => item.uuid !== uuid)];
            await storage.putSent(plain(summary));
            await removeDraft(uuid);

            return { kind: 'sent', summary };
        } catch (error) {
            if (error instanceof OfflineError) {
                state.online = false;

                return { kind: 'offline' };
            }

            if (error instanceof AuthError) {
                state.auth = 'needed';

                return { kind: 'auth' };
            }

            if (error instanceof RejectedError) {
                if (error.status === 409) {
                    await saveDraft({ ...draft, state: 'error', serverErrors: ['conflict'] });

                    return { kind: 'conflict' };
                }

                await saveDraft({ ...draft, state: 'error', serverErrors: error.fields });

                return { kind: 'invalid', fields: error.fields };
            }

            throw error;
        }
    }

    /** Los borradores listos, uno por uno: se corta si no hay señal o sesión. */
    async function sendPending(): Promise<{ sent: number; stoppedBy: 'offline' | 'auth' | null }> {
        state.busy = true;
        let sent = 0;

        try {
            for (const draft of state.drafts.filter((item) => item.state === 'ready')) {
                const outcome = await sendDraft(draft.uuid);

                if (outcome.kind === 'sent') {
                    sent++;
                } else if (outcome.kind === 'offline' || outcome.kind === 'auth') {
                    return { sent, stoppedBy: outcome.kind };
                }
            }

            return { sent, stoppedBy: null };
        } finally {
            state.busy = false;
        }
    }

    /** El enlace de un solo uso para el dueño. Sin señal o sesión devuelve null. */
    async function ownerLink(uuid: string): Promise<ConfirmationLink | null> {
        try {
            const link = await api.confirmationLink(uuid);
            await refresh();

            return link;
        } catch (error) {
            if (error instanceof AuthError) {
                state.auth = 'needed';
            } else if (error instanceof OfflineError) {
                state.online = false;
            } else if (!(error instanceof RejectedError)) {
                throw error;
            }

            return null;
        }
    }

    function setOnline(online: boolean): void {
        state.online = online;
    }

    return { state, setOnline, load, refresh, createDraft, saveDraft, removeDraft, checkDuplicates, sendDraft, sendPending, ownerLink };
}

export type Campo = ReturnType<typeof createCampo>;
