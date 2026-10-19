import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Restaurant } from '@/restaurants/api';
import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11 a 15) está abierta. */
const WEDNESDAY_NOON = new Date('2026-10-07T12:30:00-05:00');

async function mountSummary(props: { restaurant: Restaurant }, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantSummary } = await import('./RestaurantSummary.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(RestaurantSummary, { props, attachTo: host });

    return {
        inertia,
        wrapper,
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        status: () => wrapper.get('[data-status]').text().replaceAll(' ', ' '),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(WEDNESDAY_NOON);
});

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('RestaurantSummary', () => {
    it('muestra el nombre, las categorías, el estado y que hace domicilios', async () => {
        const { wrapper, status } = await mountSummary({ restaurant: LA_CEIBA });

        expect(wrapper.get('h2').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
        expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Comida típica']);
        expect(status()).toBe('Abierto ahora · cierra a las 3:00 p. m.');
        expect(wrapper.get('[data-delivery]').text()).toBe('Hace domicilios');
    });

    it('en inglés salen traducidos los textos y las categorías que mandó el servidor', async () => {
        const inEnglish = restaurant({ categories: [{ slug: 'comida-tipica', name: 'Traditional food' }] });
        const { wrapper, status } = await mountSummary({ restaurant: inEnglish }, 'en');

        expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Traditional food']);
        expect(status()).toBe('Open now · closes at 3:00 PM');
        expect(wrapper.get('[data-delivery]').text()).toBe('Delivers');
        expect(wrapper.get('button').attributes('aria-label')).toBe('Close the summary');
        expect(wrapper.text()).toContain('Sample data');
    });

    it('cerrado, dice cuándo abre', async () => {
        const { status } = await mountSummary({ restaurant: EL_GUADUAL });

        expect(status()).toBe('Cerrado · abre a las 6:00 p. m.');
    });

    it('sin horarios cargados no afirma que esté cerrado', async () => {
        const { status } = await mountSummary({ restaurant: restaurant({ hours: [], special_hours: [] }) });

        expect(status()).toBe('Horario sin confirmar');
    });

    it('si no hace domicilios, no dice nada de domicilios', async () => {
        const { wrapper } = await mountSummary({ restaurant: EL_GUADUAL });

        expect(wrapper.find('[data-delivery]').exists()).toBe(false);
    });

    it('sin categorías no deja una lista vacía', async () => {
        const { wrapper } = await mountSummary({ restaurant: restaurant({ categories: [] }) });

        expect(wrapper.find('ul').exists()).toBe(false);
    });

    it('marca los datos de ejemplo, y solo esos', async () => {
        const sample = await mountSummary({ restaurant: LA_CEIBA });
        expect(sample.wrapper.text()).toContain('Datos de ejemplo');
        sample.wrapper.unmount();

        const real = await mountSummary({ restaurant: restaurant({ fictitious: false, name: 'La Ceiba' }) });
        expect(real.wrapper.text()).not.toContain('Datos de ejemplo');
    });

    it('el estado se pone al día solo cuando pasa la hora de cierre', async () => {
        const { status } = await mountSummary({ restaurant: LA_CEIBA });
        expect(status()).toBe('Abierto ahora · cierra a las 3:00 p. m.');

        // De las 12:30 a las 15:00 y un poco más: el reloj de la página avanza cada medio minuto.
        await vi.advanceTimersByTimeAsync(2.5 * 60 * 60 * 1000 + 30_000);

        expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
    });

    it('al volver la pestaña del fondo se pone al día sin esperar al reloj', async () => {
        const { status } = await mountSummary({ restaurant: LA_CEIBA });

        vi.setSystemTime(new Date('2026-10-07T15:10:00-05:00'));
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();

        expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
    });

    describe('accesibilidad', () => {
        it('es un diálogo no modal con el nombre del restaurante como nombre', async () => {
            const { wrapper } = await mountSummary({ restaurant: LA_CEIBA });
            const dialog = wrapper.get('[role="dialog"]');

            expect(dialog.attributes('aria-modal')).toBe('false');
            expect(dialog.attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
        });

        it('al abrirse lleva el foco al nombre', async () => {
            const { wrapper } = await mountSummary({ restaurant: LA_CEIBA });

            expect(document.activeElement).toBe(wrapper.get('h2').element);
        });

        it('se cierra con un botón de verdad, con nombre y de 44 px', async () => {
            const { wrapper } = await mountSummary({ restaurant: LA_CEIBA });
            const close = wrapper.get('button');

            expect(close.attributes('type')).toBe('button');
            expect(close.attributes('aria-label')).toBe('Cerrar el resumen');
            expect(close.classes()).toContain('size-touch');

            await close.trigger('click');

            expect(wrapper.emitted('close')).toHaveLength(1);
        });

        it('las categorías son una lista con nombre', async () => {
            const { wrapper } = await mountSummary({ restaurant: EL_GUADUAL });

            expect(wrapper.get('ul').attributes('aria-label')).toBe('Tipo de comida');
            expect(wrapper.findAll('li')).toHaveLength(2);
        });
    });

    describe('enlace a la ficha', () => {
        it.each([
            ['es', 'Ver la ficha'],
            ['en', 'View details'],
        ] as const)('en %s termina en un enlace a la ficha de ese restaurante, de 44 px', async (locale, text) => {
            const { wrapper } = await mountSummary({ restaurant: EL_GUADUAL }, locale);
            const link = wrapper.get('a');

            expect(link.attributes('href')).toBe('/restaurants/prueba-el-guadual');
            expect(link.text()).toBe(text);
            expect(link.classes()).toContain('min-h-touch');
        });

        it('es el único enlace del resumen', async () => {
            const { wrapper } = await mountSummary({ restaurant: LA_CEIBA });

            expect(wrapper.findAll('a')).toHaveLength(1);
        });
    });
});
