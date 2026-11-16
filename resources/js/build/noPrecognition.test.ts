import { describe, expect, it } from 'vitest';

import { client, createValidator } from './noPrecognition';

/*
| vite.config.ts pone este módulo en lugar de `laravel-precognition` (ADR 0047).
| @inertiajs/core configura el cliente al cargarse: si una versión nueva
| encadena otro método, el arranque no puede romperse.
*/
describe('noPrecognition', () => {
    it('el cliente acepta cualquier método encadenado sin hacer nada', () => {
        // Métodos que Inertia no usa hoy: `withLoQueSea` no existe en ninguna versión.
        const call = (target: unknown, method: string, ...args: unknown[]): unknown => (target as Record<string, ((...a: unknown[]) => unknown) | undefined>)[method]?.(...args);

        expect(() => call(call(client, 'withXsrfCookieName', 'x'), 'withLoQueSea', 'y')).not.toThrow();
        expect(call(call(client, 'withXsrfCookieName', 'x'), 'withLoQueSea', 'y')).toBe(client);
        expect(call(client, 'withSerializer')).toBe(client);
        expect(call(client, 'withXsrfHeaderName', 'h')).toBe(client);
    });

    it('el cliente no se hace pasar por una promesa', () => {
        expect((client as unknown as { then?: unknown }).then).toBeUndefined();
    });

    it('createValidator falla diciendo por qué', () => {
        expect(() => createValidator()).toThrow(/noPrecognition/);
    });
});
