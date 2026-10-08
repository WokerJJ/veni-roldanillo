import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Restaurant } from '@/restaurants/api';
import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountList(locale: 'es' | 'en' = 'es', restaurants: readonly Restaurant[] = [LA_CEIBA, EL_GUADUAL]) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantList } = await import('./RestaurantList.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(RestaurantList, { props: { restaurants }, attachTo: host });

    return {
        wrapper,
        items: () => wrapper.findAll('button[data-slug]'),
        names: () => wrapper.findAll('button[data-slug] [data-name]').map((line) => line.text()),
        /** El enlace a la ficha de cada restaurante. */
        links: () => wrapper.findAll('li > a'),
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        statuses: () => wrapper.findAll('button[data-slug] [data-status]').map((line) => line.text().replaceAll(' ', ' ')),
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
    document.body.replaceChildren();
});

describe('RestaurantList', () => {
    it('cada restaurante es un botón de verdad con su nombre y su estado', async () => {
        const { items, names, statuses } = await mountList();

        expect(items().map((item) => item.attributes('type'))).toEqual(['button', 'button']);
        expect(names()).toEqual(['Restaurante de Prueba La Ceiba (ficticio)', 'Restaurante de Prueba El Guadual (ficticio)']);
        expect(statuses()).toEqual(['Abierto ahora · cierra a las 3:00 p. m.', 'Cerrado · abre a las 6:00 p. m.']);
    });

    it('rotula los datos de ejemplo, y solo esos', async () => {
        const { items } = await mountList('es', [LA_CEIBA, restaurant({ slug: 'la-real', name: 'La Real', fictitious: false })]);

        expect(items().map((item) => item.find('[data-sample]').exists())).toEqual([true, false]);
        expect(items()[0]?.get('[data-sample]').text()).toBe('Datos de ejemplo');
    });

    it('cada botón tiene un área táctil de 44 px', async () => {
        const { items } = await mountList();

        for (const item of items()) {
            expect(item.classes()).toContain('min-h-touch');
        }
    });

    describe('enlace a la ficha', () => {
        it.each([
            ['es', ['Ver la ficha de Restaurante de Prueba La Ceiba (ficticio)', 'Ver la ficha de Restaurante de Prueba El Guadual (ficticio)']],
            ['en', ['View details of Restaurante de Prueba La Ceiba (ficticio)', 'View details of Restaurante de Prueba El Guadual (ficticio)']],
        ] as const)('en %s, cada restaurante lleva un enlace a su ficha, con su nombre', async (locale, names) => {
            const { links } = await mountList(locale);

            expect(links().map((link) => link.attributes('href'))).toEqual(['/restaurants/prueba-la-ceiba', '/restaurants/prueba-el-guadual']);
            // El ícono solo no dice nada: el nombre del enlace dice a qué ficha lleva.
            expect(links().map((link) => link.attributes('aria-label'))).toEqual(names);
        });

        it('cada enlace tiene un área táctil de 44 px', async () => {
            const { links } = await mountList();

            for (const link of links()) {
                expect(link.classes()).toContain('size-touch');
            }
        });

        it('va al lado del botón, no adentro: son dos acciones distintas', async () => {
            const { wrapper, items } = await mountList();

            expect(wrapper.findAll('li')).toHaveLength(2);

            for (const row of wrapper.findAll('li')) {
                expect(row.findAll('button')).toHaveLength(1);
                expect(row.findAll('a')).toHaveLength(1);
            }

            expect(items()[0]?.find('a').exists()).toBe(false);
        });

        it('seguir el enlace no elige el restaurante en el mapa', async () => {
            const { wrapper, links } = await mountList();

            await links()[0]?.trigger('click');

            expect(wrapper.emitted('select')).toBeUndefined();
        });
    });

    it('elegir uno avisa cuál', async () => {
        const { wrapper, items } = await mountList();

        await items()[1]?.trigger('click');

        expect(wrapper.emitted('select')).toEqual([['prueba-el-guadual']]);
    });

    it('es una sección con título, que toma el foco al abrirse', async () => {
        const { wrapper } = await mountList();
        const heading = wrapper.get('h2');

        expect(heading.text()).toBe('Restaurantes');
        expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'));
        expect(document.activeElement).toBe(heading.element);
    });

    it('se cierra con un botón con nombre', async () => {
        const { wrapper } = await mountList();
        const close = wrapper.get('button[aria-label="Cerrar la lista"]');

        expect(close.classes()).toContain('size-touch');

        await close.trigger('click');

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('en inglés salen el título, el estado y el nombre del botón de cerrar', async () => {
        const { wrapper, statuses } = await mountList('en');

        expect(wrapper.get('h2').text()).toBe('Restaurants');
        expect(wrapper.find('button[aria-label="Close the list"]').exists()).toBe(true);
        expect(statuses()[0]).toBe('Open now · closes at 3:00 PM');
    });

    it('deja devolver el foco al botón de un restaurante', async () => {
        const { wrapper, items } = await mountList();

        await (wrapper.vm as unknown as { focusItem: (slug: string) => Promise<void> }).focusItem('prueba-el-guadual');

        expect(document.activeElement).toBe(items()[1]?.element);
    });

    it('si ese restaurante ya no está en la lista, el foco va al título', async () => {
        const { wrapper } = await mountList();
        wrapper.get<HTMLButtonElement>('button[aria-label="Cerrar la lista"]').element.focus();

        await (wrapper.vm as unknown as { focusItem: (slug: string) => Promise<void> }).focusItem('ya-no-esta');

        expect(document.activeElement).toBe(wrapper.get('h2').element);
    });
});
