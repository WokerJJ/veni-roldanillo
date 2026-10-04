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
| acepta, se activa cuando cierre todas las pestañas de la app.
*/

const updateReady = ref(false);

let activateUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;

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
        onRegisterError(error: unknown) {
            // Sin service worker la app funciona igual, sin modo sin conexión.
            console.warn('No se pudo registrar el service worker.', error);
        },
    });
}

/** Estado del aviso de versión nueva, compartido por toda la app. */
export function useServiceWorker() {
    return {
        updateReady: readonly(updateReady),
        /** Activa la versión que espera; la página se recarga cuando toma el control. */
        update: async (): Promise<void> => {
            updateReady.value = false;
            await activateUpdate?.(true);
        },
        /** «Ahora no»: el aviso vuelve en la próxima carga, mientras la versión siga esperando. */
        dismiss: (): void => {
            updateReady.value = false;
        },
    };
}
