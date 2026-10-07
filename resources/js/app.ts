import '../css/app.css';

import { createInertiaApp, router } from '@inertiajs/vue3';
import type { DefineComponent } from 'vue';
import { createApp, h } from 'vue';

import { cspNonce } from '@/csp';
import { openDevErrorsAsPages } from '@/devErrors';
import AppLayout from '@/layouts/AppLayout.vue';
import { registerServiceWorker, unregisterServiceWorkers } from '@/pwa/serviceWorker';

const appName = import.meta.env.VITE_APP_NAME || 'Vení Roldanillo';

// El color de la barra de progreso sale del token de la marca (brand/tokens.css).
const progressColor = getComputedStyle(document.documentElement).getPropertyValue('--veni-arrebol').trim();

// La barra de progreso inserta un <style>: con el nonce la CSP lo deja pasar.
const nonce = cspNonce();

// En desarrollo, el error de una visita se abre como página y no en el
// diálogo de Inertia, donde la CSP no deja leerlo (resources/js/devErrors.ts).
if (import.meta.env.DEV) {
    openDevErrorsAsPages(router);
}

// App instalable y sin conexión (#5): solo con el build de producción. En
// desarrollo se quita el service worker que haya dejado uno en este origen.
if (import.meta.env.PROD) {
    registerServiceWorker();
} else if (import.meta.env.DEV) {
    void unregisterServiceWorkers();
}

void createInertiaApp({
    title: (title) => (title ? `${title} · ${appName}` : appName),
    resolve: (name) => {
        const pages = import.meta.glob<DefineComponent>('./pages/**/*.vue');
        const page = pages[`./pages/${name}.vue`];

        if (!page) {
            throw new Error(`Página de Inertia no encontrada: ${name}`);
        }

        return page();
    },
    // Layout persistente por defecto: no se vuelve a montar al navegar.
    layout: () => AppLayout,
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .mount(el);
    },
    progress: {
        color: progressColor,
    },
    ...(nonce === undefined ? {} : { nonce }),
});
