/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME?: string;
    /** Plantilla del estilo del mapa, con {theme} y {locale} (resources/js/map/styleUrl.ts). */
    readonly VITE_MAP_STYLE_URL?: string;
    /** Grafo de rutas de veni-mapa (roldanillo-rutas.json), para calcularlas en el dispositivo (ADR 0008). */
    readonly VITE_MAP_ROUTES_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Para herramientas que leen solo TypeScript (typescript-eslint); vue-tsc usa el .vue real.
declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent;
    export default component;
}
