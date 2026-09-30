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
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['resources/js/**/*.test.ts'],
        restoreMocks: true,
        unstubGlobals: true,
    },
});
