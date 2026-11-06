import type { Locale } from '@/composables/useI18n';
import { intlLocale } from '@/i18n/intlLocale';

import type { Slot, WeekDay } from './schedule';
import { weekdayName } from './statusText';

/**
 * La semana compacta de la ficha (#125, #82, ADR 0038): los días seguidos con
 * el mismo horario van juntos («Lun–Sáb», «Dom»). Solo se juntan días
 * consecutivos en el orden en que se lee la semana (de lunes a domingo, el de
 * `weekSchedule`): dos días iguales con otro distinto en el medio quedan
 * separados, porque «Lun, Mié» se lee peor que dos filas.
 */
export interface DayGroup {
    /** El primer día (0 = domingo … 6 = sábado). */
    from: number;
    /** El último; igual a `from` si el grupo es de un solo día. */
    to: number;
    /** Las franjas de todos esos días; vacía si no abren. */
    slots: Slot[];
}

/** Dos días tienen el mismo horario si tienen las mismas franjas, en el mismo orden. */
function sameSlots(a: readonly Slot[], b: readonly Slot[]): boolean {
    return (
        a.length === b.length &&
        a.every((slot, index) => {
            const other = b[index];

            return other !== undefined && slot.opens === other.opens && slot.closes === other.closes;
        })
    );
}

/** Junta los días seguidos de `week` (ya ordenada) que tienen el mismo horario. */
export function groupWeek(week: readonly WeekDay[]): DayGroup[] {
    const groups: DayGroup[] = [];

    for (const day of week) {
        const last = groups.at(-1);

        if (last !== undefined && sameSlots(last.slots, day.slots)) {
            last.to = day.weekday;
        } else {
            groups.push({ from: day.weekday, to: day.weekday, slots: day.slots });
        }
    }

    return groups;
}

const shortNames = new Map<Locale, Intl.DateTimeFormat>();

/** Nombre corto del día (0 = domingo), con mayúscula inicial: «Lun», «Sáb», «Mon». */
export function shortWeekdayName(weekday: number, locale: Locale): string {
    let format = shortNames.get(locale);

    if (!format) {
        format = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
        shortNames.set(locale, format);
    }

    // El 4 de enero de 1970 fue domingo. Algunos navegadores le ponen punto («lun.»): se quita.
    const name = format.format(new Date(Date.UTC(1970, 0, 4 + (((weekday % 7) + 7) % 7)))).replace(/\.$/u, '');

    return name.charAt(0).toLocaleUpperCase(intlLocale(locale)) + name.slice(1);
}

/** El rótulo corto de un grupo, como se ve: «Lun–Sáb», «Dom». */
export function shortGroupLabel(group: DayGroup, locale: Locale): string {
    const from = shortWeekdayName(group.from, locale);

    return group.from === group.to ? from : `${from}–${shortWeekdayName(group.to, locale)}`;
}

/**
 * Los nombres completos de un grupo, para el lector de pantalla: «lunes» y
 * «sábado» (la frase «de lunes a sábado» la arma cada idioma en sus textos);
 * `to` es null si el grupo es de un solo día.
 */
export function longGroupNames(group: DayGroup, locale: Locale): { from: string; to: string | null } {
    return { from: weekdayName(group.from, locale), to: group.from === group.to ? null : weekdayName(group.to, locale) };
}
