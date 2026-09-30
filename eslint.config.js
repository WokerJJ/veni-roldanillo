// ESLint 9 (flat config) para el frontend: TypeScript estricto y Vue 3.
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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
                projectService: true,
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
        files: ['eslint.config.js'],
        ...tseslint.configs.disableTypeChecked,
        languageOptions: { globals: globals.node },
    },
);
