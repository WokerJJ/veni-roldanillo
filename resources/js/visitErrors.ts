import type { router as inertiaRouter } from '@inertiajs/vue3';

type VisitSummary = { method: string; url: URL; background: boolean };

/**
 * El error de una visita GET de Inertia se abre como una carga normal de esa
 * dirección (ADR 0014 y 0015).
 *
 * Una visita de Inertia es un pedido que hace la app, no una navegación del
 * navegador, y cuando falla nadie le muestra su página:
 *
 * - Una respuesta que no es de Inertia (un 404, un 500, un 503) sale en un
 *   diálogo con un iframe `srcdoc`, que hereda la CSP de la página: sus scripts
 *   y estilos en línea no llevan el nonce, el navegador los bloquea y la página
 *   de error se ve sin estilos (la de depuración de Laravel no se puede leer).
 *   Como navegación normal, el servidor responde su página de error y, en
 *   desarrollo, la de depuración sin CSP (SetContentSecurityPolicy).
 * - Sin señal, Inertia rechaza la visita y la página queda como estaba: tocar
 *   un enlace no hace nada. Como navegación normal, el service worker responde
 *   la página sin conexión.
 *
 * Las visitas que mandan datos (PUT /locale…) no se pueden repetir así sin
 * volver a enviarlos: siguen en el diálogo de Inertia (la respuesta completa
 * se lee en la pestaña Red de las herramientas del navegador) y, sin señal,
 * avisa quien las hizo. Tampoco se repite una visita de fondo que no llega
 * (router.reload): nadie la espera, y sacaría a la persona de la página que
 * está viendo.
 *
 * @returns Una función que deja de escuchar.
 */
export function openVisitErrorsAsPages(
    router: Pick<typeof inertiaRouter, 'on'>,
    navigate: (url: string) => void = (url) => {
        window.location.assign(url);
    },
): () => void {
    let lastVisit: VisitSummary | undefined;

    const stopStart = router.on('start', (event) => {
        const { method, url, async: background } = event.detail.visit;

        lastVisit = { method, url, background };
    });

    const stopHttpException = router.on('httpException', (event) => {
        // Una respuesta de Inertia con error es una página de la app y se lee bien.
        if (lastVisit === undefined || lastVisit.method !== 'get' || 'x-inertia' in event.detail.response.headers) {
            return;
        }

        event.preventDefault();
        navigate(lastVisit.url.href);
    });

    const stopNetworkError = router.on('networkError', (event) => {
        if (lastVisit === undefined || lastVisit.method !== 'get' || lastVisit.background) {
            return;
        }

        event.preventDefault();
        navigate(lastVisit.url.href);
    });

    return () => {
        stopStart();
        stopHttpException();
        stopNetworkError();
    };
}
