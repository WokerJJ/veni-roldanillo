import { describe, expect, it } from 'vitest';

import type { ProfileSpecialHours } from './profile';
import { upcomingSpecialDays, weekSchedule } from './schedule';

/** Un horario especial: cerrado, salvo que se den las horas. */
function special(date: string, hours: Partial<ProfileSpecialHours> = {}): ProfileSpecialHours {
    return { date, closed: true, opens: null, closes: null, note: null, ...hours };
}

function open(date: string, opens: string, closes: string, note: string | null = null): ProfileSpecialHours {
    return special(date, { closed: false, opens, closes, note });
}

describe('weekSchedule', () => {
    it('da los siete días, de lunes a domingo', () => {
        expect(weekSchedule([]).map(({ weekday }) => weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    });

    it('cada día lleva sus franjas, en orden, llegue como llegue la lista', () => {
        const week = weekSchedule([
            { weekday: 1, opens: '18:00', closes: '22:00' },
            { weekday: 0, opens: '11:00', closes: '16:00' },
            { weekday: 1, opens: '11:00', closes: '15:00' },
        ]);

        expect(week[0]).toEqual({
            weekday: 1,
            slots: [
                { opens: '11:00', closes: '15:00' },
                { opens: '18:00', closes: '22:00' },
            ],
        });
        expect(week[6]).toEqual({ weekday: 0, slots: [{ opens: '11:00', closes: '16:00' }] });
    });

    it('un día sin franjas queda vacío: ese día no abre', () => {
        const week = weekSchedule([{ weekday: 5, opens: '18:00', closes: '02:00' }]);

        expect(week.filter(({ slots }) => slots.length === 0).map(({ weekday }) => weekday)).toEqual([1, 2, 3, 4, 6, 0]);
    });

    it('una franja que pasa la medianoche pertenece al día en que empieza', () => {
        const week = weekSchedule([{ weekday: 5, opens: '18:00', closes: '02:00' }]);

        expect(week.find(({ weekday }) => weekday === 5)?.slots).toEqual([{ opens: '18:00', closes: '02:00' }]);
        expect(week.find(({ weekday }) => weekday === 6)?.slots).toEqual([]);
    });
});

describe('upcomingSpecialDays', () => {
    const TODAY = '2026-10-07';

    it('deja atrás los que ya pasaron: el de ayer viaja solo para calcular el estado', () => {
        const days = upcomingSpecialDays([special('2026-10-06'), special('2026-10-07'), special('2026-10-12')], TODAY);

        expect(days.map(({ date }) => date)).toEqual(['2026-10-07', '2026-10-12']);
    });

    it('un cerrado es un día sin franjas', () => {
        expect(upcomingSpecialDays([special('2026-10-12', { note: 'Festivo de prueba' })], TODAY)).toEqual([
            { date: '2026-10-12', closed: true, slots: [], note: 'Festivo de prueba' },
        ]);
    });

    it('junta las franjas de una misma fecha, en orden', () => {
        const days = upcomingSpecialDays([open('2026-10-14', '17:00', '21:00'), open('2026-10-14', '12:00', '14:00', 'Horario de prueba')], TODAY);

        expect(days).toEqual([
            {
                date: '2026-10-14',
                closed: false,
                slots: [
                    { opens: '12:00', closes: '14:00' },
                    { opens: '17:00', closes: '21:00' },
                ],
                note: 'Horario de prueba',
            },
        ]);
    });

    it('si una fecha trae un cerrado, está cerrada aunque traiga franjas: como en «abierto ahora»', () => {
        const days = upcomingSpecialDays([open('2026-10-14', '12:00', '14:00'), special('2026-10-14')], TODAY);

        expect(days).toEqual([{ date: '2026-10-14', closed: true, slots: [], note: null }]);
    });

    it('una fecha sin ninguna franja que valga cuenta como cerrada', () => {
        const days = upcomingSpecialDays([special('2026-10-14', { closed: false })], TODAY);

        expect(days).toEqual([{ date: '2026-10-14', closed: true, slots: [], note: null }]);
    });

    it('salen por fecha, llegue como llegue la lista', () => {
        const days = upcomingSpecialDays([special('2026-10-14'), special('2026-10-08'), special('2026-10-12')], TODAY);

        expect(days.map(({ date }) => date)).toEqual(['2026-10-08', '2026-10-12', '2026-10-14']);
    });

    it('sin horarios especiales no hay nada que mostrar', () => {
        expect(upcomingSpecialDays([], TODAY)).toEqual([]);
    });

    it('no cambia la lista que recibe', () => {
        const list = [open('2026-10-14', '17:00', '21:00'), open('2026-10-14', '12:00', '14:00')];
        const copy = structuredClone(list);

        upcomingSpecialDays(list, TODAY);

        expect(list).toEqual(copy);
    });
});
