import '../css/app.css';

import { createInertiaApp } from '@inertiajs/vue3';
import type { DefineComponent } from 'vue';
import { createApp, h } from 'vue';

import AppLayout from '@/layouts/AppLayout.vue';

const appName = import.meta.env.VITE_APP_NAME || 'Vení Roldanillo';

// El color de la barra de progreso sale del token de la marca (brand/tokens.css).
const progressColor = getComputedStyle(document.documentElement).getPropertyValue('--veni-arrebol').trim();

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
});
