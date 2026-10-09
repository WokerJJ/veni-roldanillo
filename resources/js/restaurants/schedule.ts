import type { WeeklyHours } from './openStatus';
import type { ProfileSpecialHours } from './profile';

/**
 * El horario de un restaurante ordenado para leerlo en la ficha (#13): la
 * semana día por día y los horarios especiales que vienen. Aquí no se decide
 * si está abierto: eso es de openStatus.ts, la única implementación (ADR 0017).
 */

/** Una franja: de `opens` a `closes` (`HH:MM`). Si cierra antes de lo que abre, termina al día siguiente. */
export interface Slot {
    opens: string;
    closes: string;
}

export interface WeekDay {
    /** 0 = domingo … 6 = sábado. */
    weekday: number;
    /** En orden; vacía si ese día no abre. */
    slots: Slot[];
}

/** La semana empieza el lunes, como se lee en Colombia. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

function byOpening(a: Slot, b: Slot): number {
    return a.opens.localeCompare(b.opens);
}

/** Los siete días de la semana, de lunes a domingo, cada uno con sus franjas. */
export function weekSchedule(hours: readonly WeeklyHours[]): WeekDay[] {
    return WEEK.map((weekday) => ({
        weekday,
        slots: hours
            .filter((entry) => entry.weekday === weekday)
            .map(({ opens, closes }) => ({ opens, closes }))
            .sort(byOpening),
    }));
}

/** El horario de una fecha concreta, que reemplaza al de la semana. */
export interface SpecialDay {
    /** `YYYY-MM-DD`. */
    date: string;
    /** Ese día no abre. */
    closed: boolean;
    slots: Slot[];
    /** Por qué («Festivo»), si el restaurante lo dijo. */
    note: string | null;
}

/**
 * Los horarios especiales desde `today` (`YYYY-MM-DD`) en adelante, uno por
 * fecha y en orden. Con las reglas de openStatus.ts: un «cerrado» deja la
 * fecha sin franjas, y una fecha puede traer varias.
 */
export function upcomingSpecialDays(specialHours: readonly ProfileSpecialHours[], today: string): SpecialDay[] {
    const days = new Map<string, SpecialDay>();

    for (const entry of specialHours) {
        if (entry.date < today) {
            continue;
        }

        const day = days.get(entry.date) ?? { date: entry.date, closed: false, slots: [], note: null };

        day.closed ||= entry.closed;
        day.note ??= entry.note;

        if (entry.opens !== null && entry.closes !== null) {
            day.slots.push({ opens: entry.opens, closes: entry.closes });
        }

        days.set(entry.date, day);
    }

    return [...days.values()]
        .map((day) => ({ ...day, slots: day.closed ? [] : day.slots.sort(byOpening) }))
        .map((day) => ({ ...day, closed: day.slots.length === 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
