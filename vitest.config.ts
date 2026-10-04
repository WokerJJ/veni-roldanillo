import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Configuración propia de Vitest: sin el plugin de Laravel ni Tailwind, que
// solo sirven para el servidor de desarrollo y la compilación.
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
            '@brand': fileURLToPath(new URL('./brand', import.meta.url)),
            // Módulo virtual de vite-plugin-pwa, que aquí no se carga.
            'virtual:pwa-register': fileURLToPath(new URL('./resources/js/testing/pwaRegister.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'happy-dom',
        // scripts/: pruebas de los scripts de Node (icons-sync), en entorno node.
        include: ['resources/js/**/*.test.ts', 'scripts/**/*.test.mjs'],
        // El primer import de un componente en frío puede rozar los 5 s por
        // defecto en máquinas cargadas (CI, Docker en marcha).
        testTimeout: 15_000,
        restoreMocks: true,
        unstubGlobals: true,
    },
});
