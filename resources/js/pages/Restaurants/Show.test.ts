import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { profile } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** La ficha de un restaurante, con lo que el servidor manda en sus props. */
async function mountShow(restaurant: RestaurantProfile = profile(), locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    const meta = { title: restaurant.name, description: restaurant.description ?? '' };
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true, meta });

    const { default: Show } = await import('./Show.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(Show, { props: { restaurant, meta }, attachTo: host });
    await flushPromises();

    return {
        Show,
        inertia,
        wrapper,
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        status: () => wrapper.get('header [data-status]').text().replaceAll(' ', ' '),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11 a 15) está abierta.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Restaurants/Show', () => {
    it('el título del documento es el nombre del restaurante', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.get('inertia-head').attributes('title')).toBe('Restaurante de Prueba La Ceiba (ficticio)');
    });

    it('va en el layout común, con su pie de página: no pide el modo inmersivo del mapa', async () => {
        const { Show } = await mountShow();

        expect((Show as { layout?: unknown }).layout).toBeUndefined();
    });

    it('el nombre es el único título de primer nivel', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.get('h1').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
    });

    it.each([
        ['es', 'Volver al mapa'],
        ['en', 'Back to the map'],
    ] as const)('en %s, lo primero es un enlace para volver al mapa, de 44 px', async (locale, text) => {
        const { wrapper } = await mountShow(profile(), locale);
        const back = wrapper.get('a');

        expect(back.attributes('href')).toBe('/');
        expect(back.text()).toBe(text);
        expect(back.classes()).toContain('min-h-touch');
    });

    it('muestra el tipo de comida como una lista con nombre', async () => {
        const { wrapper } = await mountShow(
            profile({
                categories: [
                    { slug: 'asados', name: 'Asados' },
                    { slug: 'comidas-rapidas', name: 'Comidas rápidas' },
                ],
            }),
        );
        const list = wrapper.get('header ul');

        expect(list.attributes('aria-label')).toBe('Tipo de comida');
        expect(list.findAll('li').map((item) => item.text())).toEqual(['Asados', 'Comidas rápidas']);
    });

    it('sin categorías no deja una lista vacía', async () => {
        const { wrapper } = await mountShow(profile({ categories: [] }));

        expect(wrapper.find('header ul').exists()).toBe(false);
    });

    it('muestra la descripción, y sin descripción no deja el hueco', async () => {
        const described = await mountShow();
        expect(described.wrapper.get('[data-description]').text()).toBe('Ficha de ejemplo para desarrollo. No corresponde a un negocio real.');
        described.wrapper.unmount();

        const bare = await mountShow(profile({ description: null }));
        expect(bare.wrapper.find('[data-description]').exists()).toBe(false);
    });

    it('marca los datos de ejemplo, y solo esos', async () => {
        const sample = await mountShow();
        expect(sample.wrapper.get('header').text()).toContain('Datos de ejemplo');
        sample.wrapper.unmount();

        const real = await mountShow(profile({ fictitious: false, name: 'La Ceiba' }));
        expect(real.wrapper.text()).not.toContain('Datos de ejemplo');
    });

    describe('abierto ahora', () => {
        it.each([
            ['es', 'Abierto ahora · cierra a las 3:00 p. m.'],
            ['en', 'Open now · closes at 3:00 PM'],
        ] as const)('en %s dice si está abierto y hasta cuándo, con el horario que mandó el servidor', async (locale, text) => {
            const { status } = await mountShow(profile(), locale);

            expect(status()).toBe(text);
        });

        it('cerrado, dice cuándo abre', async () => {
            const { status } = await mountShow(profile({ hours: [{ weekday: 3, opens: '18:00', closes: '22:00' }] }));

            expect(status()).toBe('Cerrado · abre a las 6:00 p. m.');
        });

        it('un horario especial de hoy manda sobre el de la semana', async () => {
            const { status } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-07', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
            );

            expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
        });

        it('sin horarios cargados no afirma que esté cerrado', async () => {
            const { status } = await mountShow(profile({ hours: [], special_hours: [] }));

            expect(status()).toBe('Horario sin confirmar');
        });

        it('se pone al día solo cuando pasa la hora de cierre', async () => {
            const { status } = await mountShow();

            // De las 12:30 a las 15:00 y un poco más: el reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(2.5 * 60 * 60 * 1000 + 30_000);

            expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
        });
    });

    describe('horario', () => {
        it('muestra la semana con el día de hoy resaltado', async () => {
            const { wrapper } = await mountShow();
            const hours = wrapper.getComponent({ name: 'RestaurantHours' });

            expect(hours.findAll('tbody tr')).toHaveLength(7);
            expect(hours.get('tr[aria-current="date"] th span').text()).toBe('miércoles');
        });

        it('le pasa los horarios especiales con su nota', async () => {
            const { wrapper } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-12', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
            );

            expect(wrapper.getComponent({ name: 'RestaurantHours' }).get('[data-special]').text()).toContain('Festivo de prueba');
        });

        it('sin horario cargado, lo dice', async () => {
            const { wrapper } = await mountShow(profile({ hours: [] }));

            expect(wrapper.getComponent({ name: 'RestaurantHours' }).get('[data-empty]').text()).toContain('Todavía no tenemos el horario');
        });
    });

    describe('información sin verificar', () => {
        it.each([
            ['es', 'Información sin verificar · actualizada el 5 de octubre de 2026.'],
            ['en', 'Unverified information · updated on October 5, 2026.'],
        ] as const)('en %s, una ficha sin reclamar lo dice, con la fecha de la última actualización', async (locale, text) => {
            const { wrapper } = await mountShow(profile({ unverified: true }), locale);

            expect(wrapper.get('[data-unverified]').text()).toBe(text);
        });

        it('sin fecha, lo dice igual', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, updated_on: null }));

            expect(wrapper.get('[data-unverified]').text()).toBe('Información sin verificar.');
        });

        it('una ficha reclamada no lleva el aviso', async () => {
            const { wrapper } = await mountShow(profile({ unverified: false }));

            expect(wrapper.find('[data-unverified]').exists()).toBe(false);
        });
    });

    describe('ficha oculta', () => {
        it('a quien puede verla le avisa que el público no la ve', async () => {
            const { wrapper } = await mountShow(profile({ hidden: true }));

            expect(wrapper.get('[data-hidden]').text()).toBe('Esta ficha está oculta: solo la ven la gente del restaurante y la administración.');
        });

        it('una ficha publicada no lleva el aviso', async () => {
            const { wrapper } = await mountShow();

            expect(wrapper.find('[data-hidden]').exists()).toBe(false);
        });
    });
});
