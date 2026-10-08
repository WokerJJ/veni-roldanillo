import type { DOMWrapper } from '@vue/test-utils';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeeklyHours } from '@/restaurants/openStatus';
import type { ProfileSpecialHours } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Lunes a sábado, almuerzo y comida; domingo solo almuerzo (como los datos de ejemplo). */
const LUNCH_AND_DINNER: WeeklyHours[] = [
    { weekday: 0, opens: '11:00', closes: '16:00' },
    ...[1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { weekday, opens: '11:00', closes: '15:00' },
        { weekday, opens: '18:00', closes: '22:00' },
    ]),
];

function closedOn(date: string, note: string | null = null): ProfileSpecialHours {
    return { date, closed: true, opens: null, closes: null, note };
}

function openOn(date: string, opens: string, closes: string, note: string | null = null): ProfileSpecialHours {
    return { date, closed: false, opens, closes, note };
}

async function mountHours(props: { hours?: WeeklyHours[]; specialHours?: ProfileSpecialHours[] } = {}, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantHours } = await import('./RestaurantHours.vue');
    const wrapper = mount(RestaurantHours, { props: { hours: LUNCH_AND_DINNER, specialHours: [], ...props } });

    // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
    const plain = (text: string): string => text.replaceAll(' ', ' ').replace(/\s+/g, ' ').trim();
    /** Lo que dice una celda de horas: cada franja (o «Cerrado») en su renglón, unidas con « / ». */
    const lines = (cell: Pick<DOMWrapper<Element>, 'findAll'>): string =>
        cell
            .findAll('span')
            .map((line) => plain(line.text()))
            .join(' / ');

    return {
        wrapper,
        /** Las filas de la semana: el día y lo que dice de sus horas. */
        week: () => wrapper.findAll('tbody tr').map((row) => [plain(row.get('th span').text()), lines(row.get('td'))]),
        today: () => wrapper.findAll('tr[aria-current="date"]'),
        /** Los horarios especiales: la fecha, las horas y la nota. */
        special: () =>
            wrapper
                .findAll('[data-special] li')
                .map((item) => [plain(item.get('[data-date]').text()), lines(item.get('[data-hours]')), item.find('[data-note]').exists() ? item.get('[data-note]').text() : null]),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('RestaurantHours', () => {
    it('muestra la semana de lunes a domingo, con las franjas de cada día', async () => {
        const { week } = await mountHours();

        expect(week()).toEqual([
            ['lunes', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['martes', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['miércoles', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['jueves', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['viernes', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['sábado', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
            ['domingo', '11:00 a. m. – 4:00 p. m.'],
        ]);
    });

    it('en inglés salen los días, las horas y los textos', async () => {
        const { wrapper, week } = await mountHours({ hours: [{ weekday: 1, opens: '11:00', closes: '15:00' }] }, 'en');

        expect(wrapper.get('h2').text()).toBe('Opening hours');
        expect(week().slice(0, 3)).toEqual([
            ['Monday', '11:00 AM – 3:00 PM'],
            ['Tuesday', 'Closed'],
            ['Wednesday', 'Closed'],
        ]);
        expect(wrapper.get('[data-today]').text()).toBe('Today');
    });

    it('el día que no abre dice «Cerrado»', async () => {
        const { week } = await mountHours({ hours: [{ weekday: 5, opens: '18:00', closes: '02:00' }] });

        expect(week()).toEqual([
            ['lunes', 'Cerrado'],
            ['martes', 'Cerrado'],
            ['miércoles', 'Cerrado'],
            ['jueves', 'Cerrado'],
            // La franja que pasa la medianoche va en el día en que empieza.
            ['viernes', '6:00 p. m. – 2:00 a. m.'],
            ['sábado', 'Cerrado'],
            ['domingo', 'Cerrado'],
        ]);
    });

    describe('el día de hoy', () => {
        it('va resaltado y marcado como la fecha actual, y es uno solo', async () => {
            const { today } = await mountHours();

            expect(today()).toHaveLength(1);
            expect(today()[0]?.get('th span').text()).toBe('miércoles');
            expect(today()[0]?.get('[data-today]').text()).toBe('Hoy');
            expect(today()[0]?.classes()).toContain('bg-surface');
        });

        it('no depende solo del color: lo dice con una palabra', async () => {
            const { wrapper } = await mountHours();

            expect(wrapper.findAll('[data-today]')).toHaveLength(1);
        });

        it('es el día en Colombia, no el del reloj UTC', async () => {
            // Miércoles 7 a las 20:00 en Colombia: en UTC ya es jueves 8.
            vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));
            const { today } = await mountHours();

            expect(today()[0]?.get('th span').text()).toBe('miércoles');
        });

        it('si la página queda abierta hasta la medianoche, pasa al día siguiente', async () => {
            vi.setSystemTime(new Date('2026-10-07T23:59:40-05:00'));
            const { today } = await mountHours();
            expect(today()[0]?.get('th span').text()).toBe('miércoles');

            // El reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(30_000);

            expect(today()[0]?.get('th span').text()).toBe('jueves');
        });

        it('con un horario especial hoy, la fila de hoy muestra ese: es el que vale', async () => {
            const closed = await mountHours({ specialHours: [closedOn('2026-10-07', 'Festivo de prueba')] });
            expect(closed.week()[2]).toEqual(['miércoles', 'Cerrado']);
            // Los demás días siguen con el de la semana.
            expect(closed.week()[3]).toEqual(['jueves', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.']);
            closed.wrapper.unmount();

            const shorter = await mountHours({ specialHours: [openOn('2026-10-07', '12:00', '14:00')] });
            expect(shorter.week()[2]).toEqual(['miércoles', '12:00 p. m. – 2:00 p. m.']);
        });

        it('un horario especial de otro día no cambia la fila de hoy ni la de ese día', async () => {
            const { week } = await mountHours({ specialHours: [closedOn('2026-10-08')] });

            expect(week()[2]).toEqual(['miércoles', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.']);
            expect(week()[3]).toEqual(['jueves', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.']);
        });
    });

    describe('horarios especiales', () => {
        it('lista los que vienen, con la fecha, las horas y la nota', async () => {
            const { wrapper, special } = await mountHours({
                specialHours: [
                    closedOn('2026-10-12', 'Festivo de prueba'),
                    openOn('2026-10-14', '17:00', '21:00'),
                    openOn('2026-10-14', '12:00', '14:00', 'Horario de prueba'),
                ],
            });

            expect(wrapper.get('h3').text()).toBe('Horarios especiales');
            expect(special()).toEqual([
                ['lunes, 12 de octubre', 'Cerrado', 'Festivo de prueba'],
                ['miércoles, 14 de octubre', '12:00 p. m. – 2:00 p. m. / 5:00 p. m. – 9:00 p. m.', 'Horario de prueba'],
            ]);
        });

        it('en inglés salen las fechas y los textos', async () => {
            const { wrapper, special } = await mountHours({ specialHours: [closedOn('2026-10-12', 'Test holiday')] }, 'en');

            expect(wrapper.get('h3').text()).toBe('Special hours');
            expect(special()).toEqual([['Monday, October 12', 'Closed', 'Test holiday']]);
        });

        it('el de ayer no sale: ya pasó', async () => {
            const { special } = await mountHours({ specialHours: [closedOn('2026-10-06'), closedOn('2026-10-07')] });

            expect(special().map(([date]) => date)).toEqual(['miércoles, 7 de octubre']);
        });

        it('sin ninguno que venga, no deja el título solo', async () => {
            const { wrapper } = await mountHours({ specialHours: [closedOn('2026-10-06')] });

            expect(wrapper.find('h3').exists()).toBe(false);
            expect(wrapper.find('[data-special]').exists()).toBe(false);
        });
    });

    describe('sin horario cargado', () => {
        it.each([
            ['es', 'Todavía no tenemos el horario de este restaurante. Mejor confirmá antes de ir.'],
            ['en', "We don't have this restaurant's opening hours yet. It's best to check before you go."],
        ] as const)('en %s lo dice, en vez de una semana entera de «Cerrado»', async (locale, text) => {
            const { wrapper } = await mountHours({ hours: [] }, locale);

            expect(wrapper.get('[data-empty]').text()).toBe(text);
            expect(wrapper.find('table').exists()).toBe(false);
        });

        it('los horarios especiales que haya se siguen viendo', async () => {
            const { special } = await mountHours({ hours: [], specialHours: [openOn('2026-10-12', '12:00', '16:00')] });

            expect(special()).toEqual([['lunes, 12 de octubre', '12:00 p. m. – 4:00 p. m.', null]]);
        });
    });

    describe('accesibilidad', () => {
        it('es una sección con título de segundo nivel, y la tabla lleva ese nombre', async () => {
            const { wrapper } = await mountHours();
            const id = wrapper.get('h2').attributes('id');

            expect(wrapper.get('h2').text()).toBe('Horario');
            expect(wrapper.get('section').attributes('aria-labelledby')).toBe(id);
            expect(wrapper.get('table').attributes('aria-labelledby')).toBe(id);
        });

        it('cada día es el encabezado de su fila', async () => {
            const { wrapper } = await mountHours();

            expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(7);
        });

        it('al volver la pestaña del fondo, hoy se pone al día sin esperar al reloj', async () => {
            const { today } = await mountHours();

            vi.setSystemTime(new Date('2026-10-09T08:00:00-05:00'));
            document.dispatchEvent(new Event('visibilitychange'));
            await flushPromises();

            expect(today()[0]?.get('th span').text()).toBe('viernes');
        });
    });
});
