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
        /** Los grupos de la semana: los días como se ven («Lun–Sáb») y lo que dicen de sus horas. */
        week: () => wrapper.findAll('tbody tr').map((row) => [plain(row.get('[data-days]').text()), lines(row.get('td'))]),
        /** Lo que oye el lector en cada grupo: «lunes a sábado». */
        spoken: () => wrapper.findAll('tbody th .sr-only').map((cell) => cell.text()),
        /** La línea de hoy, como se lee. */
        today: () => plain(wrapper.get('[data-today]').text()),
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
    describe('hoy, a la vista', () => {
        it('dice solo el horario de hoy, con los turnos partidos en una línea', async () => {
            const { today } = await mountHours();

            expect(today()).toBe('Hoy 11:00 a. m. – 3:00 p. m. · 6:00 p. m. – 10:00 p. m.');
        });

        it('en inglés', async () => {
            const { today, wrapper } = await mountHours({}, 'en');

            expect(today()).toBe('Today 11:00 AM – 3:00 PM · 6:00 PM – 10:00 PM');
            expect(wrapper.get('h2').text()).toBe('Opening hours');
            expect(wrapper.get('summary').text()).toBe('See the week');
        });

        it('si hoy no abre, dice «Cerrado»', async () => {
            const { today } = await mountHours({ hours: [{ weekday: 5, opens: '18:00', closes: '02:00' }] });

            expect(today()).toBe('Hoy Cerrado');
        });

        it('es el día en Colombia, no el del reloj UTC', async () => {
            // Miércoles 7 a las 20:00 en Colombia: en UTC ya es jueves 8.
            vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));
            const { today } = await mountHours({ hours: [{ weekday: 3, opens: '18:00', closes: '22:00' }] });

            expect(today()).toBe('Hoy 6:00 p. m. – 10:00 p. m.');
        });

        it('si la página queda abierta hasta la medianoche, pasa al día siguiente', async () => {
            vi.setSystemTime(new Date('2026-10-07T23:59:40-05:00'));
            const { today } = await mountHours({ hours: [{ weekday: 3, opens: '18:00', closes: '22:00' }] });
            expect(today()).toBe('Hoy 6:00 p. m. – 10:00 p. m.');

            // El reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(30_000);

            expect(today()).toBe('Hoy Cerrado');
        });

        it('con un horario especial hoy, muestra ese, con su nota: es el que vale', async () => {
            const closed = await mountHours({ specialHours: [closedOn('2026-10-07', 'Festivo de prueba')] });
            expect(closed.today()).toBe('Hoy Cerrado · Festivo de prueba');
            // No se repite en la lista de los que vienen.
            expect(closed.wrapper.find('[data-special]').exists()).toBe(false);
            closed.wrapper.unmount();

            const shorter = await mountHours({ specialHours: [openOn('2026-10-07', '12:00', '14:00')] });
            expect(shorter.today()).toBe('Hoy 12:00 p. m. – 2:00 p. m.');
        });

        it('un horario especial de otro día no cambia el de hoy', async () => {
            const { today } = await mountHours({ specialHours: [closedOn('2026-10-08')] });

            expect(today()).toBe('Hoy 11:00 a. m. – 3:00 p. m. · 6:00 p. m. – 10:00 p. m.');
        });

        it('al volver la pestaña del fondo, hoy se pone al día sin esperar al reloj', async () => {
            const { today } = await mountHours({ hours: [{ weekday: 5, opens: '18:00', closes: '22:00' }] });
            expect(today()).toBe('Hoy Cerrado');

            vi.setSystemTime(new Date('2026-10-09T08:00:00-05:00'));
            document.dispatchEvent(new Event('visibilitychange'));
            await flushPromises();

            expect(today()).toBe('Hoy 6:00 p. m. – 10:00 p. m.');
        });
    });

    describe('«Ver semana»', () => {
        it('arranca plegada: un <details> que el navegador abre con el teclado y anuncia', async () => {
            const { wrapper } = await mountHours();
            const details = wrapper.get('details');

            expect(details.attributes('open')).toBeUndefined();
            expect(details.element.firstElementChild?.tagName).toBe('SUMMARY');
            expect(wrapper.get('summary').text()).toBe('Ver semana');
            expect(wrapper.get('summary').classes()).toContain('min-h-touch');
        });

        it('junta los días seguidos con el mismo horario', async () => {
            const { week } = await mountHours();

            expect(week()).toEqual([
                ['Lun–Sáb', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.'],
                ['Dom', '11:00 a. m. – 4:00 p. m.'],
            ]);
        });

        it('el lector oye los días completos, no las abreviaturas', async () => {
            const { wrapper, spoken } = await mountHours();

            expect(spoken()).toEqual(['lunes a sábado', 'domingo']);
            expect(wrapper.get('[data-days]').attributes('aria-hidden')).toBe('true');
        });

        it('los días que no abren dicen «Cerrado», juntos si van seguidos', async () => {
            const { week } = await mountHours({ hours: [{ weekday: 5, opens: '18:00', closes: '02:00' }] });

            expect(week()).toEqual([
                ['Lun–Jue', 'Cerrado'],
                // La franja que pasa la medianoche va en el día en que empieza.
                ['Vie', '6:00 p. m. – 2:00 a. m.'],
                ['Sáb–Dom', 'Cerrado'],
            ]);
        });

        it('en inglés', async () => {
            const { week, spoken } = await mountHours({ hours: [{ weekday: 1, opens: '11:00', closes: '15:00' }] }, 'en');

            expect(week()).toEqual([
                ['Mon', '11:00 AM – 3:00 PM'],
                ['Tue–Sun', 'Closed'],
            ]);
            expect(spoken()).toEqual(['Monday', 'Tuesday to Sunday']);
        });

        it('la semana es el horario de siempre: un especial de hoy no la cambia', async () => {
            const { week } = await mountHours({ specialHours: [closedOn('2026-10-07')] });

            expect(week()[0]).toEqual(['Lun–Sáb', '11:00 a. m. – 3:00 p. m. / 6:00 p. m. – 10:00 p. m.']);
        });
    });

    describe('horarios especiales', () => {
        it('van dentro de «Ver semana», que lo avisa, con la fecha, las horas y la nota', async () => {
            const { wrapper, special } = await mountHours({
                specialHours: [
                    closedOn('2026-10-12', 'Festivo de prueba'),
                    openOn('2026-10-14', '17:00', '21:00'),
                    openOn('2026-10-14', '12:00', '14:00', 'Horario de prueba'),
                ],
            });

            expect(wrapper.get('summary').text()).toBe('Ver semana y horarios especiales');
            expect(wrapper.get('details h3').text()).toBe('Horarios especiales');
            expect(special()).toEqual([
                ['lunes, 12 de octubre', 'Cerrado', 'Festivo de prueba'],
                ['miércoles, 14 de octubre', '12:00 p. m. – 2:00 p. m. / 5:00 p. m. – 9:00 p. m.', 'Horario de prueba'],
            ]);
        });

        it('en inglés salen las fechas y los textos', async () => {
            const { wrapper, special } = await mountHours({ specialHours: [closedOn('2026-10-12', 'Test holiday')] }, 'en');

            expect(wrapper.get('summary').text()).toBe('See the week and special hours');
            expect(wrapper.get('h3').text()).toBe('Special hours');
            expect(special()).toEqual([['Monday, October 12', 'Closed', 'Test holiday']]);
        });

        it('el de ayer no sale (ya pasó) y el de hoy va en la línea de hoy', async () => {
            const { special } = await mountHours({ specialHours: [closedOn('2026-10-06'), closedOn('2026-10-07'), closedOn('2026-10-08')] });

            expect(special().map(([date]) => date)).toEqual(['jueves, 8 de octubre']);
        });

        it('sin ninguno que venga, no deja el título solo', async () => {
            const { wrapper } = await mountHours({ specialHours: [closedOn('2026-10-06')] });

            expect(wrapper.find('h3').exists()).toBe(false);
            expect(wrapper.find('[data-special]').exists()).toBe(false);
            expect(wrapper.get('summary').text()).toBe('Ver semana');
        });
    });

    describe('sin horario cargado', () => {
        it.each([
            ['es', 'Todavía no tenemos el horario de este restaurante. Mejor confirmá antes de ir.'],
            ['en', "We don't have this restaurant's opening hours yet. It's best to check before you go."],
        ] as const)('en %s lo dice, sin línea de hoy ni una semana entera de «Cerrado»', async (locale, text) => {
            const { wrapper } = await mountHours({ hours: [] }, locale);

            expect(wrapper.get('[data-empty]').text()).toBe(text);
            expect(wrapper.find('[data-today]').exists()).toBe(false);
            expect(wrapper.find('details').exists()).toBe(false);
        });

        it('los horarios especiales que haya se siguen viendo, sin la tabla de la semana', async () => {
            const { wrapper, special } = await mountHours({ hours: [], specialHours: [openOn('2026-10-12', '12:00', '16:00')] });

            expect(special()).toEqual([['lunes, 12 de octubre', '12:00 p. m. – 4:00 p. m.', null]]);
            expect(wrapper.find('table').exists()).toBe(false);
        });

        it('con un especial hoy, ese sí se dice', async () => {
            const { today } = await mountHours({ hours: [], specialHours: [openOn('2026-10-07', '12:00', '16:00')] });

            expect(today()).toBe('Hoy 12:00 p. m. – 4:00 p. m.');
        });
    });

    describe('accesibilidad', () => {
        it('es una sección con título de segundo nivel (para el lector), y la tabla lleva ese nombre', async () => {
            const { wrapper } = await mountHours();
            const id = wrapper.get('h2').attributes('id');

            expect(wrapper.get('h2').text()).toBe('Horario');
            expect(wrapper.get('h2').classes()).toContain('sr-only');
            expect(wrapper.get('section').attributes('aria-labelledby')).toBe(id);
            expect(wrapper.get('table').attributes('aria-labelledby')).toBe(id);
        });

        it('cada grupo de días es el encabezado de su fila', async () => {
            const { wrapper } = await mountHours();

            expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(2);
        });
    });
});
