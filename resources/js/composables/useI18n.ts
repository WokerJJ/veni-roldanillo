import { router, usePage } from '@inertiajs/vue3';
import type { EffectScope } from 'vue';
import { computed, effectScope, watch } from 'vue';

import type { Replacements } from '@/i18n/translate';
import { translate } from '@/i18n/translate';

// Solo el tipo: las claves salen del archivo en español y el JSON no entra al bundle.
import type es from '../../../lang/es.json';

export type Locale = 'es' | 'en';

/** Claves de lang/es.json; la prueba de paridad garantiza las mismas en inglés. */
export type TranslationKey = keyof typeof es;

/**
 * Ruta de LocaleController (routes/web.php). El servidor usa el mismo literal:
 * lo fijan tests/Feature/I18n/LocaleSwitchTest.php (la ruta) y
 * useI18n.test.ts (la petición).
 */
export const LOCALE_ENDPOINT = '/locale';

/** Texto de <meta name="description"> en resources/views/app.blade.php. */
const DESCRIPTION_KEY: TranslationKey = 'meta.description';

/**
 * El título y la descripción del documento de una página que tiene los suyos
 * (la ficha de un restaurante): los manda el servidor en la prop `meta`, ya
 * en el idioma de la petición. Las demás páginas no la traen.
 */
export interface PageMeta {
    title: string;
    description: string;
}

/**
 * Clave en localStorage del último idioma con que respondió el servidor. No
 * decide nada en la app (el idioma lo resuelve el servidor, ADR 0010): la lee
 * la página sin conexión (resources/js/offline.ts, con el mismo literal), que
 * sin red no tiene a quién preguntarle.
 */
export const LOCALE_STORAGE_KEY = 'veni:locale';

function rememberLocale(locale: Locale): void {
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // Sin almacenamiento, la página sin conexión sigue al idioma del teléfono.
    }
}

let documentScope: EffectScope | undefined;

/**
 * Mantiene <html lang> y la descripción del documento al día cuando el idioma
 * o la página cambian sin recargar (selector, enlaces o historial). El
 * servidor ya los pinta en la primera carga. La descripción es la de la
 * página, si manda la suya (`meta`), o la general de la app. Son watchers
 * globales, fuera del ciclo de vida de los componentes, que arrancan con el
 * primer componente que traduce.
 */
function syncDocument(): void {
    if (documentScope) {
        return;
    }

    documentScope = effectScope(true);
    documentScope.run(() => {
        const page = usePage();

        watch(
            () => page.props.locale,
            (locale) => {
                document.documentElement.lang = locale;
            },
            { immediate: true },
        );

        watch(
            () => page.props.meta?.description ?? page.props.translations[DESCRIPTION_KEY],
            (description) => {
                if (description !== undefined) {
                    document.head.querySelector('meta[name="description"]')?.setAttribute('content', description);
                }
            },
        );

        reloadPagesSavedInAnotherLocale(page.props.locale);
    });
}

/**
 * Con atrás y adelante, Inertia muestra la página que guardó en el historial
 * sin pedirla al servidor: si se guardó antes de cambiar de idioma, trae el
 * idioma y los textos de entonces. Se compara con el último idioma que
 * respondió el servidor y, si es otro, se pide la página de nuevo.
 *
 * No hay bucle: «beforeUpdate» solo llega con respuestas del servidor y antes
 * que «navigate», así que una página recién recibida nunca difiere; y si la
 * recarga falla (sin red) no hay respuesta ni «navigate» que la repita.
 */
function reloadPagesSavedInAnotherLocale(initialLocale: Locale): void {
    let serverLocale = initialLocale;

    // Para la página sin conexión se recuerda solo lo que respondió el
    // servidor (la primera página y cada «beforeUpdate»), nunca el idioma de
    // una página que sale del historial: si su recarga no llega (sin red),
    // quedaría guardado el idioma viejo.
    rememberLocale(serverLocale);

    router.on('beforeUpdate', (event) => {
        serverLocale = event.detail.page.props.locale;
        rememberLocale(serverLocale);
    });

    router.on('navigate', (event) => {
        if (event.detail.page.props.locale !== serverLocale) {
            router.reload();
        }
    });
}

/**
 * Idioma y textos de la interfaz (ADR 0010). El servidor resuelve el idioma y
 * comparte sus traducciones como props de Inertia; aquí se leen y, para
 * cambiar de idioma, se le pide al servidor.
 */
export function useI18n() {
    syncDocument();

    const page = usePage();

    function t(key: TranslationKey, replacements?: Replacements): string {
        return translate(page.props.translations, key, replacements);
    }

    /**
     * Cambia el idioma sin recargar: el servidor lo guarda (cookie y cuenta) y
     * responde la misma página con los textos del idioma nuevo, que reemplaza
     * la entrada del historial: «atrás» no vuelve a la misma página en el
     * idioma anterior.
     *
     * Exige red: los textos del otro idioma no están en el dispositivo. Sin
     * conexión, o si la petición no llega, llama a `onOffline` para que quien
     * eligió el idioma se entere (con la app instalada es fácil intentarlo sin
     * señal).
     */
    function setLocale(locale: Locale, { onOffline }: { onOffline?: () => void } = {}): void {
        if (locale === page.props.locale) {
            return;
        }

        if (onOffline && !navigator.onLine) {
            onOffline();

            return;
        }

        router.put(
            LOCALE_ENDPOINT,
            { locale },
            {
                preserveScroll: true,
                preserveState: true,
                replace: true,
                // false: el aviso ya lo da quien llamó; sin él, Inertia sigue
                // con su evento global y rechaza la visita.
                onNetworkError: () => {
                    if (onOffline) {
                        onOffline();

                        return false;
                    }
                },
            },
        );
    }

    return {
        locale: computed(() => page.props.locale),
        t,
        setLocale,
    };
}
