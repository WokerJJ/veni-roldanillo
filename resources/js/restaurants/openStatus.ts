/**
 * «Abierto ahora»: la única implementación (ADR 0017). Vive en el dispositivo
 * y no en el servidor porque la respuesta con los restaurantes se guarda en
 * cachés: un «abierto» calculado al responder seguiría diciendo «abierto»
 * después del cierre. El servidor manda el horario, que cambia poco, y aquí
 * se calcula con la hora del momento, también mientras la página sigue abierta.
 *
 * Reglas (las del modelo de datos, ADR 0009):
 *
 * - La hora es la de Colombia, esté donde esté el teléfono.
 * - Una franja pertenece al día en que empieza. Si cierra antes de lo que abre
 *   (18:00 a 02:00), termina al día siguiente.
 * - Un horario especial reemplaza al semanal en su fecha: cerrado todo el día,
 *   o con sus propias franjas. No toca la madrugada que viene de la víspera.
 * - Abre a la hora en punto y cierra a la hora en punto: a las 15:00 ya cerró.
 */

/** Zona horaria del municipio. Colombia no cambia de hora en el año. */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

/** Hasta cuántos días adelante se busca la próxima apertura (los que manda el servidor). */
export const DAYS_AHEAD = 7;

/** Franja del horario semanal. `weekday`: 0 = domingo … 6 = sábado. Horas `HH:MM`. */
export interface WeeklyHours {
    weekday: number;
    opens: string;
    closes: string;
}

/** Horario de una fecha (`YYYY-MM-DD`): cerrado, o una franja (puede haber varias por fecha). */
export interface SpecialHours {
    date: string;
    closed: boolean;
    opens: string | null;
    closes: string | null;
}

export interface Schedule {
    hours: readonly WeeklyHours[];
    special_hours: readonly SpecialHours[];
}

/** Un momento cercano: el día (contado desde hoy) y la hora de Colombia. */
export interface Moment {
    /** 0 = hoy, 1 = mañana… */
    daysAhead: number;
    /** 0 = domingo … 6 = sábado. */
    weekday: number;
    /** `HH:MM`, de 00:00 a 23:59. */
    time: string;
}

export type OpenStatus =
    /** Sin horarios cargados: no se afirma que esté cerrado. */
    | { state: 'unknown' }
    /** `closes` es null si falta más de un día para que cierre. */
    | { state: 'open'; closes: Moment | null }
    /** `opens` es null si no abre en los próximos días. */
    | { state: 'closed'; opens: Moment | null };

const DAY = 24 * 60;

const WEEKDAYS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Crear el formateador cuesta: uno solo para todos los cálculos.
const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
});

interface LocalNow {
    /** Hoy en Colombia: año, mes (1-12) y día. */
    year: number;
    month: number;
    day: number;
    weekday: number;
    /** Minutos desde la medianoche de hoy. */
    minutes: number;
}

function localNow(now: Date): LocalNow {
    const parts: Record<string, string> = {};

    for (const part of clock.formatToParts(now)) {
        parts[part.type] = part.value;
    }

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
}

/** `HH:MM` → minutos desde la medianoche; lo que no sea una hora, null. */
function minutesOf(time: string | null): number | null {
    const [, hours, minutes] = /^(\d{1,2}):(\d{2})/.exec(time ?? '') ?? [];

    if (hours === undefined || minutes === undefined || Number(hours) > 23 || Number(minutes) > 59) {
        return null;
    }

    return Number(hours) * 60 + Number(minutes);
}

function timeOf(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Un tramo abierto, en minutos desde la medianoche de hoy: [desde, hasta). */
type Span = [from: number, until: number];

/** Tramo de una franja que empieza un día dado (`offset` días desde hoy). */
function span(offset: number, opens: string | null, closes: string | null): Span | null {
    const from = minutesOf(opens);
    const until = minutesOf(closes);

    if (from === null || until === null || from === until) {
        return null;
    }

    // Cierra antes de lo que abre: termina al día siguiente.
    return [offset * DAY + from, offset * DAY + (until > from ? until : until + DAY)];
}

/**
 * Si un restaurante está abierto en el instante `now`, y cuándo cambia.
 * `now` es un instante (un `Date`): la zona del dispositivo no cuenta.
 */
export function openStatus(schedule: Schedule, now: Date): OpenStatus {
    if (schedule.hours.length === 0 && schedule.special_hours.length === 0) {
        return { state: 'unknown' };
    }

    const today = localNow(now);
    const spans: Span[] = [];

    // Desde ayer: una franja de ayer puede seguir abierta pasada la medianoche.
    for (let offset = -1; offset <= DAYS_AHEAD; offset += 1) {
        // Mediodía en UTC: sumar días no cruza ningún cambio de fecha.
        const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
        const iso = date.toISOString().slice(0, 10);
        const special = schedule.special_hours.filter((entry) => entry.date === iso);
        const slots =
            special.length > 0
                ? // Un «cerrado» deja la fecha sin franjas.
                  special.some((entry) => entry.closed)
                    ? []
                    : special.map((entry) => span(offset, entry.opens, entry.closes))
                : schedule.hours.filter((entry) => entry.weekday === date.getUTCDay()).map((entry) => span(offset, entry.opens, entry.closes));

        spans.push(...slots.filter((slot) => slot !== null));
    }

    spans.sort((a, b) => a[0] - b[0]);

    // Tramos seguidos o encimados son uno solo: 11-15 y 15-18 cierra a las 18.
    const merged: Span[] = [];

    for (const [from, until] of spans) {
        const last = merged.at(-1);

        if (last && from <= last[1]) {
            last[1] = Math.max(last[1], until);
        } else {
            merged.push([from, until]);
        }
    }

    const moment = (minutes: number): Moment => {
        const daysAhead = Math.floor(minutes / DAY);

        return { daysAhead, weekday: (((today.weekday + daysAhead) % 7) + 7) % 7, time: timeOf(((minutes % DAY) + DAY) % DAY) };
    };

    const current = merged.find(([from, until]) => from <= today.minutes && today.minutes < until);

    if (current) {
        return { state: 'open', closes: current[1] - today.minutes > DAY ? null : moment(current[1]) };
    }

    const next = merged.find(([from]) => from > today.minutes);

    return { state: 'closed', opens: next ? moment(next[0]) : null };
}
