/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME?: string;
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
