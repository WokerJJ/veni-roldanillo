import type { Locale, TranslationKey } from '@/composables/useI18n';
import { intlLocale } from '@/i18n/intlLocale';
import type { Replacements } from '@/i18n/translate';

import type { Moment, OpenStatus } from './openStatus';

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
 * El estado en dos partes, cada una de su clave: lo principal («Abierto
 * ahora», «Cerrado», «Horario sin confirmar») y, si se sabe, cuándo cambia
 * («cierra a las 3:00 p. m.», «abre mañana a las 11:00 a. m.»), o null. La
 * píldora de la lista del celular (#139) muestra la primera en la píldora.
 */
export function openStatusParts(status: OpenStatus, t: Translate, locale: Locale): { head: string; tail: string | null } {
    if (status.state === 'unknown') {
        return { head: t('restaurants.status.unknown'), tail: null };
    }

    if (status.state === 'open') {
        return {
            head: t('restaurants.status.open'),
            tail: status.closes === null ? null : t('restaurants.status.closes', { time: spokenTime(status.closes.time, t, locale) }),
        };
    }

    return { head: t('restaurants.status.closed'), tail: status.opens === null ? null : opensText(status.opens, t, locale) };
}

/**
 * El estado en palabras: «Abierto ahora · cierra a las 3:00 p. m.»,
 * «Cerrado · abre mañana a las 11:00 a. m.», «Horario sin confirmar». Las dos
 * partes las junta el idioma (`restaurants.status.parts`).
 */
export function openStatusText(status: OpenStatus, t: Translate, locale: Locale): string {
    const { head, tail } = openStatusParts(status, t, locale);

    return tail === null ? head : t('restaurants.status.parts', { state: head, detail: tail });
}

/**
 * Solo cuándo abre, sin el «Cerrado» de adelante: «abre a las 6:00 p. m.»,
 * «abre mañana a las 11:00 a. m.», «abre el viernes a las 8:00 a. m.». Para
 * una frase que ya dice que está cerrado (#138, «Sugerime algo» sin abiertos).
 */
export function opensText(opens: Moment, t: Translate, locale: Locale): string {
    const time = spokenTime(opens.time, t, locale);

    if (opens.daysAhead === 0) {
        return t('restaurants.status.opens_today', { time });
    }

    if (opens.daysAhead === 1) {
        return t('restaurants.status.opens_tomorrow', { time });
    }

    return t('restaurants.status.opens_weekday', { day: weekdayName(opens.weekday, locale), time });
}
