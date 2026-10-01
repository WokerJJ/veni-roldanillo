// ESLint 9 (flat config) para el frontend: TypeScript estricto y Vue 3.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['public/**', 'vendor/**', 'node_modules/**', 'bootstrap/ssr/**', 'storage/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['**/*.{ts,vue}'],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                parser: tseslint.parser,
                projectService: {
                    // vite.config.ts y vitest.config.ts corren en Node: usa tsconfig.node.json, no el del navegador.
                    allowDefaultProject: ['vite.config.ts', 'vitest.config.ts'],
                    defaultProject: 'tsconfig.node.json',
                },
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: ['.vue'],
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            // El formato del HTML de las plantillas no es tarea del linter.
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': ['error', 4],
        },
    },
    {
        // Las páginas de Inertia se nombran por su ruta (Home, Restaurants/Show…).
        files: ['resources/js/pages/**/*.vue'],
        rules: {
            'vue/multi-word-component-names': 'off',
        },
    },
    {
        // Icon pinta SVG del repositorio verificados por sha256 y validados por
        // scripts/icons-sync.mjs (ADR 0011); en el resto, v-html sigue prohibido.
        // Su nombre de una palabra no choca con ningún elemento de HTML ni de SVG.
        files: ['resources/js/components/Icon.vue'],
        rules: {
            'vue/no-v-html': 'off',
            'vue/multi-word-component-names': 'off',
        },
    },
    {
        files: ['vite.config.ts', 'vitest.config.ts'],
        languageOptions: { globals: globals.node },
    },
    {
        // JavaScript de Node sin tsconfig: sin las reglas que necesitan tipos.
        files: ['eslint.config.js', 'scripts/**/*.mjs'],
        ...tseslint.configs.disableTypeChecked,
        languageOptions: { globals: globals.node },
    },
);
