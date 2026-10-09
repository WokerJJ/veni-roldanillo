import type { Locale } from '@/composables/useI18n';

import { intlLocale } from './intlLocale';

/**
 * Lo que escribe `Intl` según el idioma de la interfaz: precios y fechas. Los
 * formatos no se arman a mano: cada idioma tiene su separador de miles, su
 * orden del día y el mes y su manera de nombrar la moneda.
 */

// Crear un formateador cuesta: uno por idioma y por forma, la primera vez que se usa.
const formats = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, create: () => T): T {
    let format = formats.get(key) as T | undefined;

    if (!format) {
        format = create();
        formats.set(key, format);
    }

    return format;
}

/**
 * Un precio en pesos colombianos, sin decimales (los precios son pesos
 * enteros, ADR 0009): «$ 18.500» en español; en inglés «COP 18,500», con el
 * código de la moneda, para que un turista no lo lea como dólares.
 */
export function formatPesos(amount: number, locale: Locale): string {
    return cached(
        `pesos:${locale}`,
        () => new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    ).format(amount);
}

/** Una fecha `YYYY-MM-DD` como instante al mediodía UTC: formatearla en UTC no la corre de día. */
function dateOf(isoDate: string): Date | null {
    const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate) ?? [];

    return year === undefined ? null : new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
}

/**
 * Una fecha `YYYY-MM-DD` con su día de la semana, sin el año: «lunes, 12 de
 * octubre», «Monday, October 12». Lo que no sea una fecha vuelve tal cual.
 */
export function formatDay(isoDate: string, locale: Locale): string {
    const date = dateOf(isoDate);

    return date === null
        ? isoDate
        : cached(`day:${locale}`, () => new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })).format(
              date,
          );
}

/** Una fecha `YYYY-MM-DD` con el año: «8 de octubre de 2026», «October 8, 2026». */
export function formatDate(isoDate: string, locale: Locale): string {
    const date = dateOf(isoDate);

    return date === null
        ? isoDate
        : cached(`date:${locale}`, () => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })).format(
              date,
          );
}
