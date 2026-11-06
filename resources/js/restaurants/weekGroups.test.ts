import { describe, expect, it } from 'vitest';

import type { WeeklyHours } from './openStatus';
import { weekSchedule } from './schedule';
import { groupWeek, longGroupNames, shortGroupLabel, shortWeekdayName } from './weekGroups';

const LUNCH = { opens: '11:00', closes: '15:00' };
const DINNER = { opens: '18:00', closes: '22:00' };

/** Los días `weekdays` con las franjas `slots`. */
function on(weekdays: number[], ...slots: { opens: string; closes: string }[]): WeeklyHours[] {
    return weekdays.flatMap((weekday) => slots.map((slot) => ({ weekday, ...slot })));
}

/** La semana agrupada, como se lee: el rótulo y las franjas («11:00-15:00 18:00-22:00» o «cerrado»). */
function read(hours: WeeklyHours[], locale: 'es' | 'en' = 'es'): string[] {
    return groupWeek(weekSchedule(hours)).map((group) => {
        const slots = group.slots.length === 0 ? 'cerrado' : group.slots.map(({ opens, closes }) => `${opens}-${closes}`).join(' ');

        return `${shortGroupLabel(group, locale)} ${slots}`;
    });
}

describe('groupWeek', () => {
    it('junta los días seguidos con el mismo horario, con el turno partido', () => {
        expect(read([...on([1, 2, 3, 4, 5, 6], LUNCH, DINNER), ...on([0], { opens: '11:00', closes: '16:00' })])).toEqual([
            'Lun–Sáb 11:00-15:00 18:00-22:00',
            'Dom 11:00-16:00',
        ]);
    });

    it('la semana empieza el lunes: el domingo va al final aunque sea igual al lunes', () => {
        expect(read(on([0, 1, 2, 3, 4, 5, 6], LUNCH))).toEqual(['Lun–Dom 11:00-15:00']);
        expect(read(on([0, 1], LUNCH))).toEqual(['Lun 11:00-15:00', 'Mar–Sáb cerrado', 'Dom 11:00-15:00']);
    });

    it('el día que no abre es un grupo «cerrado», y los cerrados seguidos van juntos', () => {
        expect(read(on([2, 3, 4, 5, 6, 0], LUNCH))).toEqual(['Lun cerrado', 'Mar–Dom 11:00-15:00']);
        expect(read(on([1, 2, 3, 4], LUNCH))).toEqual(['Lun–Jue 11:00-15:00', 'Vie–Dom cerrado']);
    });

    it('solo junta días consecutivos: dos iguales con otro distinto en el medio quedan aparte', () => {
        expect(read([...on([1, 3], LUNCH), ...on([2], DINNER)])).toEqual([
            'Lun 11:00-15:00',
            'Mar 18:00-22:00',
            'Mié 11:00-15:00',
            'Jue–Dom cerrado',
        ]);
    });

    it('un turno partido no es igual a uno solo: el mismo almuerzo con comida y sin ella van aparte', () => {
        expect(read([...on([1, 2], LUNCH, DINNER), ...on([3, 4, 5, 6, 0], LUNCH)])).toEqual(['Lun–Mar 11:00-15:00 18:00-22:00', 'Mié–Dom 11:00-15:00']);
    });

    it('sin horario cargado, es un solo grupo cerrado (quien lo muestra dice que no hay horario)', () => {
        expect(groupWeek(weekSchedule([]))).toEqual([{ from: 1, to: 0, slots: [] }]);
    });

    it('en inglés salen los nombres del inglés', () => {
        expect(read([...on([1, 2, 3, 4, 5, 6], LUNCH), ...on([0], DINNER)], 'en')).toEqual(['Mon–Sat 11:00-15:00', 'Sun 18:00-22:00']);
    });
});

describe('nombres de los días', () => {
    it('el corto lleva mayúscula inicial y no lleva punto', () => {
        expect([1, 2, 3, 4, 5, 6, 0].map((day) => shortWeekdayName(day, 'es'))).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
        expect([1, 0].map((day) => shortWeekdayName(day, 'en'))).toEqual(['Mon', 'Sun']);
    });

    it('los completos, para el lector de pantalla: el primero y el último, o solo uno', () => {
        expect(longGroupNames({ from: 1, to: 6, slots: [] }, 'es')).toEqual({ from: 'lunes', to: 'sábado' });
        expect(longGroupNames({ from: 0, to: 0, slots: [] }, 'en')).toEqual({ from: 'Sunday', to: null });
    });
});
