import { usePage } from '@inertiajs/vue3';
import type { EffectScope } from 'vue';
import { computed, effectScope, watch } from 'vue';

import type { Replacements } from '@/i18n/translate';
import { translate } from '@/i18n/translate';

// Solo el tipo: las claves salen del archivo en español y el JSON no entra al bundle.
import type es from '../../../lang/es.json';

export type Locale = 'es' | 'en';

/** Claves de lang/es.json; la prueba de paridad garantiza las mismas en inglés. */
export type TranslationKey = keyof typeof es;

let documentLangScope: EffectScope | undefined;

/**
 * Mantiene <html lang> al día cuando el idioma cambia sin recargar (selector
 * o historial). El servidor ya lo pinta en la primera carga. Es un watcher
 * global, fuera del ciclo de vida de los componentes, que arranca con el
 * primer componente que traduce.
 */
function syncDocumentLang(): void {
    if (documentLangScope) {
        return;
    }

    documentLangScope = effectScope(true);
    documentLangScope.run(() => {
        const page = usePage();

        watch(
            () => page.props.locale,
            (locale) => {
                document.documentElement.lang = locale;
            },
            { immediate: true },
        );
    });
}

/**
 * Idioma y textos de la interfaz (ADR 0010). El servidor resuelve el idioma y
 * comparte sus traducciones como props de Inertia; aquí solo se leen.
 */
export function useI18n() {
    syncDocumentLang();

    const page = usePage();

    function t(key: TranslationKey, replacements?: Replacements): string {
        return translate(page.props.translations, key, replacements);
    }

    return {
        locale: computed(() => page.props.locale),
        t,
    };
}
