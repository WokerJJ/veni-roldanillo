import { router } from '@inertiajs/vue3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDevErrorsAsPages } from './devErrors';

// Los eventos globales de Inertia viajan por document como `inertia:<nombre>`.
function startVisit(method: string, url: string): void {
    document.dispatchEvent(
        new CustomEvent('inertia:start', { detail: { visit: { method, url: new URL(url, window.location.href) } } }),
    );
}

/** @returns Si el diálogo de Inertia se mostraría (nadie canceló el evento). */
function httpException(headers: Record<string, string> = { 'content-type': 'text/html' }): boolean {
    return document.dispatchEvent(
        new CustomEvent('inertia:httpException', {
            cancelable: true,
            detail: { response: { status: 500, data: '<html>error</html>', headers } },
        }),
    );
}

describe('openDevErrorsAsPages', () => {
    let stop: (() => void) | undefined;

    afterEach(() => {
        stop?.();
        stop = undefined;
    });

    it('abre como página el error de una visita GET, sin el diálogo de Inertia', () => {
        const navigate = vi.fn();
        stop = openDevErrorsAsPages(router, navigate);

        startVisit('get', '/restaurantes?pagina=2');

        expect(httpException()).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith(new URL('/restaurantes?pagina=2', window.location.href).href);
    });

    it('deja el diálogo en las visitas que mandan datos: repetirlas las volvería a enviar', () => {
        const navigate = vi.fn();
        stop = openDevErrorsAsPages(router, navigate);

        startVisit('put', '/locale');

        expect(httpException()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('no toca una respuesta de Inertia con error: es una página de la app', () => {
        const navigate = vi.fn();
        stop = openDevErrorsAsPages(router, navigate);

        startVisit('get', '/');

        expect(httpException({ 'x-inertia': 'true' })).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('deja de escuchar al llamar a la función que devuelve', () => {
        const navigate = vi.fn();
        openDevErrorsAsPages(router, navigate)();

        startVisit('get', '/');

        expect(httpException()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });
});
