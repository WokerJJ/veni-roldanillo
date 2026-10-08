import type { Locale, TranslationKey } from '@/composables/useI18n';
import { intlLocale } from '@/i18n/intlLocale';
import type { Replacements } from '@/i18n/translate';

import type { OpenStatus } from './openStatus';

/** `t()` de useI18n. */
type Translate = (key: TranslationKey, replacements?: Replacements) => string;

/** Espacio que no parte la línea: «6:00 p. m.» no se corta al final de un renglón. */
const NBSP = ' ';

const clocks = new Map<Locale, Intl.DateTimeFormat>();

/**
 * Una hora `HH:MM` con el reloj de doce horas de cada idioma: «6:00 p. m.»,
 * «6:00 PM». La escribe Intl; lo que la rodea en una frase (el artículo del
 * español) está en los textos del idioma, ver `spokenTime`.
 */
export function formatClock(time: string, locale: Locale): string {
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    let format = clocks.get(locale);

    if (!format) {
        format = new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
        clocks.set(locale, format);
    }

    // Según el navegador, Intl separa con un espacio común, uno angosto o uno
    // que no parte la línea: queda siempre este último.
    return format.format(new Date(Date.UTC(1970, 0, 1, hours, minutes))).replace(/\s/gu, NBSP);
}

/**
 * La hora como va en «abre a :time». En español lleva el artículo, que cambia
 * con la una («las 6:00 p. m.», «la 1:00 p. m.»); en inglés va sola. Cada
 * idioma lo dice en sus textos: aquí solo se elige entre la una y las demás.
 */
function spokenTime(time: string, t: Translate, locale: Locale): string {
    const isOne = Number(time.split(':')[0]) % 12 === 1;

    return t(isOne ? 'restaurants.status.time_one' : 'restaurants.status.time_many', { time: formatClock(time, locale) });
}

const weekdayNames = new Map<Locale, Intl.DateTimeFormat>();

/** Nombre del día (0 = domingo): «viernes», «Friday». */
export function weekdayName(weekday: number, locale: Locale): string {
    let format = weekdayNames.get(locale);

    if (!format) {
        format = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' });
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
        return status.closes === null ? t('restaurants.status.open') : t('restaurants.status.open_until', { time: spokenTime(status.closes.time, t, locale) });
    }

    if (status.opens === null) {
        return t('restaurants.status.closed');
    }

    const time = spokenTime(status.opens.time, t, locale);

    if (status.opens.daysAhead === 0) {
        return t('restaurants.status.closed_opens_today', { time });
    }

    if (status.opens.daysAhead === 1) {
        return t('restaurants.status.closed_opens_tomorrow', { time });
    }

    return t('restaurants.status.closed_opens_weekday', { day: weekdayName(status.opens.weekday, locale), time });
}
