import type { router as inertiaRouter } from '@inertiajs/vue3';

type VisitSummary = { method: string; url: URL };

/**
 * En desarrollo, el error de una visita de Inertia se abre como una página
 * propia (ADR 0014).
 *
 * Inertia muestra una respuesta que no es suya (la página de depuración de
 * Laravel) en un diálogo con un iframe `srcdoc`, que hereda la CSP de la
 * página: sus scripts y estilos en línea no llevan el nonce, el navegador los
 * bloquea y el error no se puede leer. En una visita GET se vuelve a pedir la
 * URL como navegación normal, y Laravel responde la página de depuración sin
 * CSP (SetContentSecurityPolicy).
 *
 * Las visitas que mandan datos (PUT /locale…) no se pueden repetir así sin
 * volver a enviarlos: siguen en el diálogo de Inertia, y la respuesta completa
 * se lee en la pestaña Red de las herramientas del navegador.
 *
 * Solo en desarrollo: app.ts lo instala con `import.meta.env.DEV`, y la
 * compilación de producción no lo incluye.
 *
 * @returns Una función que deja de escuchar.
 */
export function openDevErrorsAsPages(
    router: Pick<typeof inertiaRouter, 'on'>,
    navigate: (url: string) => void = (url) => {
        window.location.assign(url);
    },
): () => void {
    let lastVisit: VisitSummary | undefined;

    const stopStart = router.on('start', (event) => {
        lastVisit = { method: event.detail.visit.method, url: event.detail.visit.url };
    });

    const stopHttpException = router.on('httpException', (event) => {
        // Una respuesta de Inertia con error es una página de la app y se lee bien.
        if (lastVisit === undefined || lastVisit.method !== 'get' || 'x-inertia' in event.detail.response.headers) {
            return;
        }

        event.preventDefault();
        navigate(lastVisit.url.href);
    });

    return () => {
        stopStart();
        stopHttpException();
    };
}
