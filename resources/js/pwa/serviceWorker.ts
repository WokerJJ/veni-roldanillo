import { registerSW } from 'virtual:pwa-register';
import { readonly, ref } from 'vue';

/*
| Registro del service worker de la PWA (#5, public/sw.js) y aviso de versión
| nueva. Va en el bundle y no en un script en línea: la CSP solo deja correr
| scripts de este origen o con nonce, y `worker-src 'self'` deja registrar
| /sw.js (ADR 0014).
|
| Una versión nueva no se activa sola: queda esperando y la app avisa
| («Hay una versión nueva · Actualizar», UpdatePrompt.vue). Activarla sin
| preguntar recargaría la página en medio de un pedido; si la persona no la
| acepta, se activa cuando cierre todas las pestañas de la app. Solo se
| recarga la pestaña donde se aceptó: las demás siguen con el aviso.
*/

const updateReady = ref(false);

let activateUpdate: (() => Promise<void>) | undefined;

/**
 * Registra el service worker. Solo en producción (app.ts): en desarrollo
 * guardaría assets que Vite cambia a cada rato. Workbox espera al evento
 * `load` para registrarlo, así no compite con la primera carga.
 */
export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    activateUpdate = registerSW({
        onNeedRefresh() {
            updateReady.value = true;
        },
        // Otra pestaña aceptó la versión nueva y esta pasó a depender de ella.
        // Sin esta opción, el registro recargaría esta pestaña sin preguntar
        // (quizá en medio de un pedido): el aviso sigue a la vista y
        // «Actualizar» recarga.
        onNeedReload() {},
        onRegisterError(error: unknown) {
            // Sin service worker la app funciona igual, sin modo sin conexión.
            console.warn('No se pudo registrar el service worker.', error);
        },
    });
}

/**
 * Quita los service workers de este origen. Para desarrollo (app.ts), donde
 * no se registra ninguno: el navegador puede traer el de un build de
 * producción servido antes en la misma dirección (`npm run build`, la imagen
 * de producción en local), que seguiría sirviendo lo guardado encima de Vite.
 * Deja de mandar desde la próxima carga de la página.
 */
export async function unregisterServiceWorkers(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registrations = await navigator.serviceWorker.getRegistrations();

        await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
        console.warn('No se pudieron quitar los service workers de este origen.', error);
    }
}

/** Estado del aviso de versión nueva, compartido por toda la app. */
export function useServiceWorker() {
    return {
        updateReady: readonly(updateReady),
        /**
         * Activa la versión que espera y recarga esta pestaña, una vez, cuando
         * la versión nueva toma el control. La recarga va por cuenta propia:
         * el registro no recarga a nadie (`onNeedReload`), y en la primera
         * visita tampoco lo haría. Si ya no hay versión esperando, otra
         * pestaña la activó y esta ya depende de ella: solo falta recargar.
         */
        update: async (): Promise<void> => {
            updateReady.value = false;

            if (activateUpdate === undefined) {
                return;
            }

            const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);

            if (!registration?.waiting) {
                window.location.reload();

                return;
            }

            navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => {
                    window.location.reload();
                },
                { once: true },
            );
            await activateUpdate();
        },
        /** «Ahora no»: el aviso vuelve en la próxima carga, mientras la versión siga esperando. */
        dismiss: (): void => {
            updateReady.value = false;
        },
    };
}
