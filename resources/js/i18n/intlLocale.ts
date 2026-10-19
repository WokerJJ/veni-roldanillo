import type { Locale } from '@/composables/useI18n';

/**
 * El idioma de la interfaz como lo pide Intl: las horas, las fechas y los
 * precios, como se escriben en Colombia. Va en su propio módulo, sin los
 * formatos de `intl.ts`: lo usa el estado «abierto ahora» del inicio, y lo que
 * importa el inicio baja con el arranque.
 */
export function intlLocale(locale: Locale): string {
    return locale === 'en' ? 'en-US' : 'es-CO';
}
