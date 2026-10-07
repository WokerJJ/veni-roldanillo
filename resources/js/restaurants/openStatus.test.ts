import { afterEach, describe, expect, it } from 'vitest';

import type { Schedule, SpecialHours, WeeklyHours } from './openStatus';
import { BUSINESS_TIME_ZONE, openStatus } from './openStatus';

/*
| «Abierto ahora» con fechas fijas. Octubre de 2026: el 5 es lunes, el 7
| miércoles, el 9 viernes, el 10 sábado y el 11 domingo. Los instantes se
| escriben con la hora de Colombia (UTC-5), así cada prueba se lee como un
| reloj de pared en Roldanillo.
*/

const SUN = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const EVERY_DAY = [SUN, MON, TUE, WED, THU, FRI, SAT];

/** Un instante, dado como fecha y hora de Colombia. */
function bogota(date: string, time: string): Date {
    return new Date(`${date}T${time}:00-05:00`);
}

function weekly(weekday: number, opens: string, closes: string): WeeklyHours {
    return { weekday, opens, closes };
}

function closedOn(date: string): SpecialHours {
    return { date, closed: true, opens: null, closes: null };
}

function openOn(date: string, opens: string, closes: string): SpecialHours {
    return { date, closed: false, opens, closes };
}

function schedule(hours: readonly WeeklyHours[], special_hours: readonly SpecialHours[] = []): Schedule {
    return { hours, special_hours };
}

/** Lunes a sábado, almuerzo y comida; domingo solo almuerzo (como los datos de ejemplo). */
const LUNCH_AND_DINNER = schedule([
    weekly(SUN, '11:00', '16:00'),
    ...[MON, TUE, WED, THU, FRI, SAT].flatMap((day) => [weekly(day, '11:00', '15:00'), weekly(day, '18:00', '22:00')]),
]);

describe('abierto ahora', () => {
    describe('horario semanal', () => {
        it('dentro de una franja está abierto y dice a qué hora cierra', () => {
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '12:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: WED, time: '15:00' },
            });
        });

        it('antes de abrir está cerrado y dice a qué hora abre hoy', () => {
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '09:15'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '11:00' },
            });
        });

        it('entre dos franjas está cerrado hasta la siguiente', () => {
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '16:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '18:00' },
            });
        });

        it('después de la última franja abre mañana', () => {
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '22:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: THU, time: '11:00' },
            });
        });

        it('abre a la hora en punto', () => {
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '10:59')).state).toBe('closed');
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '11:00')).state).toBe('open');
        });

        it('a la hora de cierre ya cerró; un segundo antes, no', () => {
            expect(openStatus(LUNCH_AND_DINNER, new Date('2026-10-07T14:59:59-05:00')).state).toBe('open');
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '15:00')).state).toBe('closed');
        });

        it('dos franjas seguidas cuentan como una: cierra cuando termina la segunda', () => {
            const continuous = schedule([weekly(WED, '11:00', '15:00'), weekly(WED, '15:00', '18:00')]);

            expect(openStatus(continuous, bogota('2026-10-07', '14:00'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: WED, time: '18:00' },
            });
        });

        it('el orden en que llegan las franjas no importa', () => {
            const shuffled = schedule([weekly(WED, '18:00', '22:00'), weekly(THU, '11:00', '15:00'), weekly(WED, '11:00', '15:00')]);

            expect(openStatus(shuffled, bogota('2026-10-07', '16:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '18:00' },
            });
        });
    });

    describe('día cerrado', () => {
        const WEEKDAYS_ONLY = schedule([MON, TUE, WED, THU, FRI].map((day) => weekly(day, '08:00', '17:00')));

        it('un día sin franjas está cerrado y dice qué día vuelve a abrir', () => {
            // Sábado: no abre hasta el lunes.
            expect(openStatus(WEEKDAYS_ONLY, bogota('2026-10-10', '12:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 2, weekday: MON, time: '08:00' },
            });
        });

        it('la víspera de un día cerrado dice el día correcto, pasando por el fin de semana', () => {
            expect(openStatus(WEEKDAYS_ONLY, bogota('2026-10-09', '17:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 3, weekday: MON, time: '08:00' },
            });
        });

        it('del sábado al domingo la semana da la vuelta', () => {
            const weekend = schedule([weekly(SUN, '09:00', '13:00')]);

            expect(openStatus(weekend, bogota('2026-10-10', '20:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: SUN, time: '09:00' },
            });
        });

        it('si solo abre un día a la semana, lo encuentra aunque falten seis', () => {
            const sundays = schedule([weekly(SUN, '09:00', '13:00')]);

            // Lunes: el domingo siguiente está a seis días.
            expect(openStatus(sundays, bogota('2026-10-05', '10:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 6, weekday: SUN, time: '09:00' },
            });
        });
    });

    describe('franjas que cruzan la medianoche', () => {
        const NIGHTS = schedule([weekly(FRI, '18:00', '02:00'), weekly(SAT, '18:00', '02:00')]);

        it('la noche del viernes sigue abierta el sábado de madrugada', () => {
            expect(openStatus(NIGHTS, bogota('2026-10-10', '01:00'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: SAT, time: '02:00' },
            });
        });

        it('antes de la medianoche dice que cierra mañana', () => {
            expect(openStatus(NIGHTS, bogota('2026-10-09', '23:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 1, weekday: SAT, time: '02:00' },
            });
        });

        it('a la hora de cierre de la madrugada ya cerró, y abre esa misma tarde', () => {
            expect(openStatus(NIGHTS, bogota('2026-10-10', '02:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: SAT, time: '18:00' },
            });
        });

        it('la noche del sábado sigue abierta el domingo de madrugada, aunque el domingo no abra', () => {
            expect(openStatus(NIGHTS, bogota('2026-10-11', '00:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: SUN, time: '02:00' },
            });
        });

        it('el jueves de madrugada no hay víspera abierta', () => {
            expect(openStatus(NIGHTS, bogota('2026-10-08', '01:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: FRI, time: '18:00' },
            });
        });

        it('una franja que cierra justo a la medianoche cierra a las 00:00 de mañana', () => {
            const untilMidnight = schedule([weekly(WED, '17:00', '00:00')]);

            expect(openStatus(untilMidnight, bogota('2026-10-07', '23:59'))).toEqual({
                state: 'open',
                closes: { daysAhead: 1, weekday: THU, time: '00:00' },
            });
            expect(openStatus(untilMidnight, bogota('2026-10-08', '00:00')).state).toBe('closed');
        });

        it('la madrugada de la víspera y la franja de hoy, si se tocan, son una sola', () => {
            const overlapping = schedule([weekly(FRI, '18:00', '03:00'), weekly(SAT, '02:00', '05:00')]);

            expect(openStatus(overlapping, bogota('2026-10-10', '01:00'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: SAT, time: '05:00' },
            });
        });
    });

    describe('horarios especiales', () => {
        it('un día cerrado manda sobre el horario semanal', () => {
            const holiday = schedule(LUNCH_AND_DINNER.hours, [closedOn('2026-10-07')]);

            expect(openStatus(holiday, bogota('2026-10-07', '12:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: THU, time: '11:00' },
            });
        });

        it('un horario distinto ese día reemplaza al semanal entero', () => {
            const shortDay = schedule(LUNCH_AND_DINNER.hours, [openOn('2026-10-07', '17:00', '21:00')]);

            // El almuerzo de siempre no cuenta.
            expect(openStatus(shortDay, bogota('2026-10-07', '12:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '17:00' },
            });
            expect(openStatus(shortDay, bogota('2026-10-07', '18:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: WED, time: '21:00' },
            });
            // A las 21:30 el semanal diría abierto hasta las 22.
            expect(openStatus(shortDay, bogota('2026-10-07', '21:30')).state).toBe('closed');
        });

        it('una fecha puede tener varias franjas especiales', () => {
            const split = schedule([], [openOn('2026-10-07', '12:00', '14:00'), openOn('2026-10-07', '17:00', '21:00')]);

            expect(openStatus(split, bogota('2026-10-07', '15:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '17:00' },
            });
        });

        it('solo valen en su fecha: al otro día vuelve el horario semanal', () => {
            const holiday = schedule(LUNCH_AND_DINNER.hours, [closedOn('2026-10-07')]);

            expect(openStatus(holiday, bogota('2026-10-08', '12:30')).state).toBe('open');
            expect(openStatus(holiday, bogota('2026-10-06', '12:30')).state).toBe('open');
        });

        it('el cierre de hoy no corta la madrugada que viene de la víspera', () => {
            const nights = schedule([weekly(FRI, '18:00', '02:00'), weekly(SAT, '18:00', '02:00')], [closedOn('2026-10-10')]);

            expect(openStatus(nights, bogota('2026-10-10', '01:00'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: SAT, time: '02:00' },
            });
            // Pero esa noche, la del sábado cerrado, no abre.
            expect(openStatus(nights, bogota('2026-10-10', '20:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 6, weekday: FRI, time: '18:00' },
            });
        });

        it('el cierre de la víspera sí se lleva su madrugada', () => {
            const nights = schedule([weekly(FRI, '18:00', '02:00')], [closedOn('2026-10-09')]);

            expect(openStatus(nights, bogota('2026-10-10', '01:00')).state).toBe('closed');
        });

        it('una franja especial de la víspera que cruza la medianoche sigue abierta hoy', () => {
            const party = schedule(LUNCH_AND_DINNER.hours, [openOn('2026-10-06', '20:00', '03:00')]);

            // El martes de siempre habría cerrado a las 22.
            expect(openStatus(party, bogota('2026-10-07', '01:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: WED, time: '03:00' },
            });
        });

        it('la próxima apertura salta los días cerrados que vienen', () => {
            const closedTwoDays = schedule(LUNCH_AND_DINNER.hours, [closedOn('2026-10-08'), closedOn('2026-10-09')]);

            expect(openStatus(closedTwoDays, bogota('2026-10-07', '22:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 3, weekday: SAT, time: '11:00' },
            });
        });

        it('cruza bien el cambio de mes y de año', () => {
            const newYear = schedule([weekly(THU, '11:00', '15:00'), weekly(FRI, '11:00', '15:00')], [closedOn('2027-01-01')]);

            // Jueves 31 de diciembre de 2026 por la tarde: el viernes 1 está cerrado; abre el jueves 7.
            expect(openStatus(newYear, bogota('2026-12-31', '16:00'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 7, weekday: THU, time: '11:00' },
            });
        });
    });

    describe('sin datos y casos raros', () => {
        it('sin ningún horario cargado no afirma que esté cerrado', () => {
            expect(openStatus(schedule([]), bogota('2026-10-07', '12:30'))).toEqual({ state: 'unknown' });
        });

        it('con solo horarios especiales sí se sabe', () => {
            expect(openStatus(schedule([], [openOn('2026-10-07', '12:00', '14:00')]), bogota('2026-10-07', '12:30')).state).toBe('open');
            expect(openStatus(schedule([], [closedOn('2026-10-07')]), bogota('2026-10-07', '12:30'))).toEqual({ state: 'closed', opens: null });
        });

        it('si no abre en los próximos siete días, está cerrado sin fecha de apertura', () => {
            const closedAllWeek = schedule(
                [weekly(WED, '11:00', '15:00')],
                ['2026-10-07', '2026-10-14'].map((date) => closedOn(date)),
            );

            expect(openStatus(closedAllWeek, bogota('2026-10-07', '12:30'))).toEqual({ state: 'closed', opens: null });
        });

        it('si no cierra en las próximas 24 horas, está abierto sin hora de cierre', () => {
            // Dos franjas seguidas por día, de medianoche a medianoche: nunca cierra.
            const nonStop = schedule(EVERY_DAY.flatMap((day) => [weekly(day, '00:00', '12:00'), weekly(day, '12:00', '00:00')]));

            expect(openStatus(nonStop, bogota('2026-10-07', '03:00'))).toEqual({ state: 'open', closes: null });
        });

        it('si cierra un minuto cada madrugada, dice esa hora de mañana', () => {
            const almostNonStop = schedule(EVERY_DAY.map((day) => weekly(day, '06:00', '05:59')));

            expect(openStatus(almostNonStop, bogota('2026-10-07', '12:00'))).toEqual({
                state: 'open',
                closes: { daysAhead: 1, weekday: THU, time: '05:59' },
            });
        });

        it('una franja que abre y cierra a la misma hora está vacía (la base no la deja guardar)', () => {
            expect(openStatus(schedule([weekly(WED, '06:00', '06:00')]), bogota('2026-10-07', '12:00'))).toEqual({ state: 'closed', opens: null });
        });

        it('una hora mal escrita no cuenta como franja', () => {
            const broken = schedule([weekly(WED, 'once', '15:00'), weekly(WED, '25:00', '26:00'), weekly(WED, '18:00', '22:00')]);

            expect(openStatus(broken, bogota('2026-10-07', '12:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '18:00' },
            });
        });

        it('acepta las horas con segundos, como las guarda la base', () => {
            const withSeconds = schedule([weekly(WED, '11:00:00', '15:00:00')]);

            expect(openStatus(withSeconds, bogota('2026-10-07', '12:30')).state).toBe('open');
        });
    });

    describe('la hora es la de Colombia', () => {
        const originalZone = process.env.TZ;

        afterEach(() => {
            if (originalZone === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = originalZone;
            }
        });

        it('usa la zona America/Bogota', () => {
            expect(BUSINESS_TIME_ZONE).toBe('America/Bogota');
        });

        it('no usa la hora UTC del instante', () => {
            // 16:30 UTC son las 11:30 en Colombia.
            const now = new Date('2026-10-07T16:30:00Z');

            expect(openStatus(schedule([weekly(WED, '11:00', '12:00')]), now).state).toBe('open');
            expect(openStatus(schedule([weekly(WED, '16:00', '17:00')]), now)).toEqual({
                state: 'closed',
                opens: { daysAhead: 0, weekday: WED, time: '16:00' },
            });
        });

        it('cerca de la medianoche, el día es el de Colombia y no el de UTC', () => {
            // Miércoles 7 a las 20:00 en Colombia: en UTC ya es jueves 8.
            const now = new Date('2026-10-08T01:00:00Z');

            expect(openStatus(schedule([weekly(WED, '18:00', '22:00')]), now).state).toBe('open');
            expect(openStatus(schedule([weekly(THU, '18:00', '22:00')]), now)).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: THU, time: '18:00' },
            });
            expect(openStatus(schedule([weekly(WED, '18:00', '22:00')], [closedOn('2026-10-08')]), now).state).toBe('open');
            expect(openStatus(schedule([weekly(WED, '18:00', '22:00')], [closedOn('2026-10-07')]), now).state).toBe('closed');
        });

        it.each(['Asia/Tokyo', 'Pacific/Honolulu', 'UTC', 'Europe/Madrid'])('da lo mismo en un teléfono con la hora de %s', (zone) => {
            process.env.TZ = zone;

            // El teléfono de una turista sigue con la hora de su país.
            expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '12:30'))).toEqual({
                state: 'open',
                closes: { daysAhead: 0, weekday: WED, time: '15:00' },
            });
            expect(openStatus(LUNCH_AND_DINNER, bogota('2026-10-07', '23:30'))).toEqual({
                state: 'closed',
                opens: { daysAhead: 1, weekday: THU, time: '11:00' },
            });
        });
    });
});
