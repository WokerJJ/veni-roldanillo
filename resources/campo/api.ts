/*
| El cliente de la API de /campo (ADR 0048). Todo va con la sesión de
| administración y el token CSRF que da `/campo/api/me`. Distingue tres
| fallas que la pantalla trata distinto: sin señal (se guarda y se reintenta),
| sin sesión (401 o 419: se pide entrar de nuevo, sin perder nada) y un
| rechazo del servidor (422 o 409: hay que corregir).
*/

import type { Candidate, ReturnedContent, SubmissionBody } from './draft';
import type { Category, SentSummary } from './storage';

export class OfflineError extends Error {}

export class AuthError extends Error {}

export class RejectedError extends Error {
    constructor(
        public readonly status: number,
        public readonly fields: string[],
        public readonly reason: string | null,
    ) {
        super(`El servidor rechazó la ficha (${String(status)}).`);
    }
}

export interface Me {
    user: { id: number; name: string };
    csrf: string;
    categories: Category[];
    payment_methods: string[];
}

export interface ServerSubmission extends SentSummary {
    content?: ReturnedContent;
}

export interface ConfirmationLink {
    url: string;
    expires_at: string | null;
    whatsapp_url: string;
}

export interface CampoApi {
    me(): Promise<Me>;
    duplicates(name: string, latitude: number, longitude: number, uuid: string): Promise<Candidate[]>;
    list(): Promise<ServerSubmission[]>;
    send(uuid: string, body: SubmissionBody): Promise<{ created: boolean; submission: ServerSubmission }>;
    confirmationLink(uuid: string): Promise<ConfirmationLink>;
}

interface ErrorBody {
    message?: string;
    errors?: Record<string, string[]>;
}

export function createApi(doFetch: typeof fetch = (...args) => fetch(...args)): CampoApi {
    let csrf = '';

    async function call(method: string, path: string, body?: unknown, retried = false): Promise<Response> {
        let response: Response;

        try {
            response = await doFetch(`/campo/api${path}`, {
                method,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                    'X-CSRF-TOKEN': csrf,
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch {
            throw new OfflineError('Sin señal.');
        }

        if (response.status === 419 && !retried && path !== '/me') {
            // El token venció (la sesión cambió): se pide uno nuevo y se reintenta una vez.
            await me();

            return call(method, path, body, true);
        }

        if (response.status === 401 || response.status === 419 || response.status === 403) {
            throw new AuthError('Sin sesión de administración.');
        }

        if (response.status >= 500 || response.status === 429 || response.status === 408) {
            throw new OfflineError(`El servidor no pudo atender (${String(response.status)}).`);
        }

        return response;
    }

    async function json<T>(response: Response): Promise<T> {
        return (await response.json()) as T;
    }

    async function rejected(response: Response): Promise<never> {
        const body = await json<ErrorBody>(response).catch((): ErrorBody => ({}));

        throw new RejectedError(response.status, Object.keys(body.errors ?? {}), body.message ?? null);
    }

    async function me(): Promise<Me> {
        const response = await call('GET', '/me');

        if (!response.ok) {
            return rejected(response);
        }

        const data = await json<Me>(response);
        csrf = data.csrf;

        return data;
    }

    return {
        me,
        async duplicates(name, latitude, longitude, uuid) {
            const response = await call('POST', '/duplicates', { name, latitude, longitude, uuid });

            if (!response.ok) {
                return rejected(response);
            }

            return (await json<{ candidates: Candidate[] }>(response)).candidates;
        },
        async list() {
            const response = await call('GET', '/submissions');

            if (!response.ok) {
                return rejected(response);
            }

            return (await json<{ submissions: ServerSubmission[] }>(response)).submissions;
        },
        async send(uuid, body) {
            const response = await call('PUT', `/submissions/${uuid}`, body);

            if (!response.ok) {
                return rejected(response);
            }

            return { created: response.status === 201, submission: await json<ServerSubmission>(response) };
        },
        async confirmationLink(uuid) {
            const response = await call('POST', `/submissions/${uuid}/confirmation-link`, {});

            if (!response.ok) {
                return rejected(response);
            }

            return json<ConfirmationLink>(response);
        },
    };
}
