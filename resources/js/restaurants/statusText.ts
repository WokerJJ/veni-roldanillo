import type { Locale, TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';

import type { OpenStatus } from './openStatus';

/** `t()` de useI18n. */
type Translate = (key: TranslationKey, replacements?: Replacements) => string;

/** Espacio que no parte la línea: «6:00 p. m.» no se corta al final de un renglón. */
const NBSP = ' ';

/**
 * Una hora `HH:MM` como se dice en cada idioma, con reloj de doce horas. En
 * español lleva el artículo, que cambia con la una: «las 6:00 p. m.», «la
 * 1:00 p. m.» (los textos dicen «abre a :time»). En inglés, «6:00 PM».
 */
export function formatClock(time: string, locale: Locale): string {
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    const hour = hours % 12 === 0 ? 12 : hours % 12;
    const clock = `${String(hour)}:${String(minutes).padStart(2, '0')}`;

    if (locale === 'en') {
        return `${clock}${NBSP}${hours < 12 ? 'AM' : 'PM'}`;
    }

    return `${hour === 1 ? 'la' : 'las'} ${clock}${NBSP}${hours < 12 ? 'a.' : 'p.'}${NBSP}m.`;
}

const weekdayNames = new Map<Locale, Intl.DateTimeFormat>();

/** Nombre del día (0 = domingo): «viernes», «Friday». */
export function weekdayName(weekday: number, locale: Locale): string {
    let format = weekdayNames.get(locale);

    if (!format) {
        format = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', timeZone: 'UTC' });
        weekdayNames.set(locale, format);
    }

    // El 4 de enero de 1970 fue domingo.
    return format.format(new Date(Date.UTC(1970, 0, 4 + (((weekday % 7) + 7) % 7))));
}

/**
 * El estado en palabras: «Abierto ahora · cierra a las 3:00 p. m.»,
 * «Cerrado · abre mañana a las 11:00 a. m.», «Horario sin confirmar».
 */
export function openStatusText(status: OpenStatus, t: Translate, locale: Locale): string {
    if (status.state === 'unknown') {
        return t('restaurants.status.unknown');
    }

    if (status.state === 'open') {
        return status.closes === null ? t('restaurants.status.open') : t('restaurants.status.open_until', { time: formatClock(status.closes.time, locale) });
    }

    if (status.opens === null) {
        return t('restaurants.status.closed');
    }

    const time = formatClock(status.opens.time, locale);

    if (status.opens.daysAhead === 0) {
        return t('restaurants.status.closed_opens_today', { time });
    }

    if (status.opens.daysAhead === 1) {
        return t('restaurants.status.closed_opens_tomorrow', { time });
    }

    return t('restaurants.status.closed_opens_weekday', { day: weekdayName(status.opens.weekday, locale), time });
}
