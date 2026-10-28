import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Restaurant } from '@/restaurants/api';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';
import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountList(
    locale: 'es' | 'en' = 'es',
    restaurants: readonly Restaurant[] = [LA_CEIBA, EL_GUADUAL],
    distances: Record<string, number> | null = null,
) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantList } = await import('./RestaurantList.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(RestaurantList, { props: { restaurants, distances }, attachTo: host });

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

    it('deja devolverle el foco al botón de un restaurante y, si ya no está, a su título', async () => {
        const { wrapper } = await mountList();
        const list = wrapper.vm as unknown as { focusItem: (slug: string) => void };

        list.focusItem('prueba-el-guadual');
        expect(document.activeElement).toBe(wrapper.get('button[data-slug="prueba-el-guadual"]').element);

        list.focusItem('no-existe');
        expect(document.activeElement).toBe(wrapper.get('h2').element);
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

    describe('compacta (#81)', () => {
        const LA_PLAZA = restaurant({ slug: 'prueba-la-plaza', name: 'La Plaza de prueba' });

        it('primero los abiertos ahora, y entre ellos el orden de siempre si no hay ubicación', async () => {
            const { names, wrapper } = await mountList('es', [EL_GUADUAL, LA_CEIBA, LA_PLAZA]);

            expect(names()).toEqual([LA_CEIBA.name, LA_PLAZA.name, EL_GUADUAL.name]);
            expect(wrapper.find('[data-distance]').exists()).toBe(false);
        });

        it('con ubicación, entre los abiertos va primero el más cerca, con su distancia junto al estado', async () => {
            const { names, wrapper } = await mountList('es', [EL_GUADUAL, LA_CEIBA, LA_PLAZA], {
                'prueba-la-ceiba': 1250,
                'prueba-la-plaza': 320,
                'prueba-el-guadual': 40,
            });

            // El Guadual está más cerca, pero cerrado: va después.
            expect(names()).toEqual([LA_PLAZA.name, LA_CEIBA.name, EL_GUADUAL.name]);
            expect(wrapper.findAll('[data-distance]').map((distance) => distance.text().replaceAll(' ', ' '))).toEqual(['320 m', '1,3 km', '40 m']);
        });

        it('abierta, el orden se fija con la primera ubicación: después solo cambia el texto de la distancia', async () => {
            const { names, wrapper } = await mountList('es', [EL_GUADUAL, LA_CEIBA, LA_PLAZA]);
            const distances = () => wrapper.findAll('[data-distance]').map((distance) => distance.text().replaceAll(' ', ' '));

            // Llega la primera posición: se ordena por cercanía una vez.
            await wrapper.setProps({ distances: { 'prueba-la-ceiba': 1250, 'prueba-la-plaza': 320, 'prueba-el-guadual': 40 } });
            expect(names()).toEqual([LA_PLAZA.name, LA_CEIBA.name, EL_GUADUAL.name]);

            // Quien la usa camina: La Ceiba queda más cerca, pero nada salta bajo el dedo.
            await wrapper.setProps({ distances: { 'prueba-la-ceiba': 90, 'prueba-la-plaza': 600, 'prueba-el-guadual': 40 } });
            expect(names()).toEqual([LA_PLAZA.name, LA_CEIBA.name, EL_GUADUAL.name]);
            expect(distances()).toEqual(['600 m', '90 m', '40 m']);
        });

        it('abierta, si uno abre o cierra mientras se mira, no cambia de lugar', async () => {
            const { names } = await mountList('es', [EL_GUADUAL, LA_CEIBA, LA_PLAZA]);

            // 15:30: La Ceiba ya cerró.
            vi.setSystemTime(new Date('2026-10-07T15:30:00-05:00'));
            await vi.advanceTimersByTimeAsync(60_000);

            expect(names()).toEqual([LA_CEIBA.name, LA_PLAZA.name, EL_GUADUAL.name]);
        });

        it('si todos son de ejemplo, lo dice una sola vez, arriba', async () => {
            const { wrapper } = await mountList();

            expect(wrapper.findAll('[data-sample]')).toHaveLength(1);
            expect(wrapper.find('li [data-sample]').exists()).toBe(false);
        });

        it('si solo algunos lo son, lo lleva cada uno de ellos', async () => {
            const { wrapper } = await mountList('es', [LA_CEIBA, restaurant({ slug: 'real', name: 'Uno de verdad', fictitious: false })]);

            expect(wrapper.findAll('li [data-sample]')).toHaveLength(1);
        });
    });
});

describe('búsqueda y filtros (#12)', () => {
    const FONDA = restaurant({ slug: 'prueba-fonda', name: 'Fonda de Prueba (ficticio)', delivery: true });

    it('un filtro saca filas sin reordenar las que quedan', async () => {
        const { wrapper, items } = await mountList('es', [EL_GUADUAL, LA_CEIBA, FONDA]);
        const before = items().map((item) => item.attributes('data-slug'));

        await wrapper.setProps({ filters: { ...NO_FILTERS, delivery: true } });

        expect(items().map((item) => item.attributes('data-slug'))).toEqual(before.filter((slug) => slug !== 'prueba-el-guadual'));
        expect(wrapper.get('[data-count]').text()).toBe('2 de 3 restaurantes');
    });

    it('al escribir emite los filtros nuevos; no filtra por su cuenta', async () => {
        const { wrapper, items } = await mountList();

        await wrapper.get('input[data-search]').setValue('ceiba');

        expect(wrapper.emitted('update:filters')).toEqual([[{ ...NO_FILTERS, query: 'ceiba' }]]);
        expect(items()).toHaveLength(2);
    });

    it('las categorías para elegir salen de todos, sin repetir', async () => {
        const { wrapper } = await mountList();

        expect(wrapper.findAll('select[data-filter="category"] option').map((option) => option.text())).toEqual([
            'Todos',
            'Asados',
            'Comida típica',
            'Comidas rápidas',
        ]);
    });

    it('«Sugerime algo» emite uno de los abiertos que cumplen los filtros; si no hay, lo dice', async () => {
        const { wrapper } = await mountList('es', [EL_GUADUAL, LA_CEIBA]);

        await wrapper.get('button[data-suggest]').trigger('click');
        expect(wrapper.emitted('select')).toEqual([['prueba-la-ceiba']]);

        await wrapper.setProps({ filters: { ...NO_FILTERS, query: 'guadual' } });
        await wrapper.get('button[data-suggest]').trigger('click');
        expect(wrapper.emitted('select')).toHaveLength(1);
        expect(wrapper.get('[data-count]').text()).toBe('Ahora no hay ningún restaurante abierto con estos filtros.');
    });

    it('en inglés', async () => {
        const { wrapper } = await mountList('en', [EL_GUADUAL, LA_CEIBA]);
        await wrapper.setProps({ filters: { ...NO_FILTERS, query: 'nothing' } });

        expect(wrapper.get('label').text()).toBe('Search by name or type of food');
        expect(wrapper.get('[data-count]').text()).toBe('No restaurant matches your search. Try fewer filters.');
        expect(wrapper.get('button[data-empty-clear]').text()).toBe('Clear filters');
        expect(wrapper.get('details[data-lunches] summary').text()).toBe("Today's lunches");
    });
});
