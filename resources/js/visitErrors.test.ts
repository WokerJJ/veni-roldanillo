import { router } from '@inertiajs/vue3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openVisitErrorsAsPages } from './visitErrors';

// Los eventos globales de Inertia viajan por document como `inertia:<nombre>`.
function startVisit(method: string, url: string, { async = false }: { async?: boolean } = {}): void {
    document.dispatchEvent(
        new CustomEvent('inertia:start', { detail: { visit: { method, url: new URL(url, window.location.href), async } } }),
    );
}

/** @returns Si el diálogo de Inertia se mostraría (nadie canceló el evento). */
function httpException(headers: Record<string, string> = { 'content-type': 'text/html' }, status = 500): boolean {
    return document.dispatchEvent(
        new CustomEvent('inertia:httpException', {
            cancelable: true,
            detail: { response: { status, data: '<html>error</html>', headers } },
        }),
    );
}

/** @returns Si Inertia rechazaría la visita y la página quedaría como estaba (nadie canceló el evento). */
function networkError(): boolean {
    return document.dispatchEvent(
        new CustomEvent('inertia:networkError', { cancelable: true, detail: { error: new Error('Network Error') } }),
    );
}

describe('openVisitErrorsAsPages', () => {
    let stop: (() => void) | undefined;

    afterEach(() => {
        stop?.();
        stop = undefined;
    });

    it.each([404, 500, 503])('abre como página el %i de una visita GET, sin el diálogo de Inertia', (status) => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('get', '/restaurantes?pagina=2');

        expect(httpException(undefined, status)).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith(new URL('/restaurantes?pagina=2', window.location.href).href);
    });

    it('sin señal, repite la visita GET como una carga normal: el service worker responde la página sin conexión', () => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('get', '/restaurants/prueba-la-ceiba');

        expect(networkError()).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith(new URL('/restaurants/prueba-la-ceiba', window.location.href).href);
    });

    it('deja el diálogo en las visitas que mandan datos: repetirlas las volvería a enviar', () => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('put', '/locale');

        expect(httpException()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('sin señal tampoco repite las visitas que mandan datos: sigue avisando quien las hizo', () => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('put', '/locale');

        expect(networkError()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('sin señal no repite una visita que nadie espera (una recarga de fondo): no saca a nadie de la página que está viendo', () => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('get', '/', { async: true });

        expect(networkError()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('no toca una respuesta de Inertia con error: es una página de la app', () => {
        const navigate = vi.fn();
        stop = openVisitErrorsAsPages(router, navigate);

        startVisit('get', '/');

        expect(httpException({ 'x-inertia': 'true' })).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('deja de escuchar al llamar a la función que devuelve', () => {
        const navigate = vi.fn();
        openVisitErrorsAsPages(router, navigate)();

        startVisit('get', '/');

        expect(httpException()).toBe(true);
        expect(networkError()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });
});
