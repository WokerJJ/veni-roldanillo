import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { MenuSection } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { nth } from '@/testing/present';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Un menú de ejemplo: dos secciones, con un plato agotado hoy (7 de octubre) y otro sin descripción. */
const MENU: MenuSection[] = [
    {
        name: 'Platos fuertes (prueba)',
        dishes: [
            { name: 'Sancocho de prueba', description: 'Con arroz y aguacate.', price: 18500, sold_out_until: null, groups: [] },
            { name: 'Bandeja de prueba', description: null, price: 22000, sold_out_until: '2026-10-07', groups: [] },
        ],
    },
    {
        name: 'Bebidas (prueba)',
        dishes: [{ name: 'Jugo de prueba', description: 'En agua o en leche.', price: 4000, sold_out_until: null, groups: [] }],
    },
];

/** Un menú con un solo plato, agotado hasta esa fecha. */
function soldOutUntil(date: string | null): MenuSection[] {
    return [{ name: 'Platos fuertes (prueba)', dishes: [{ name: 'Bandeja de prueba', description: null, price: 22000, sold_out_until: date, groups: [] }] }];
}

async function mountMenu(sections: MenuSection[] = MENU, locale: 'es' | 'en' = 'es', slug: string | null = null) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantMenu } = await import('./RestaurantMenu.vue');
    const wrapper = mount(RestaurantMenu, { props: { sections, slug }, attachTo: document.body });

    return {
        wrapper,
        sections: () => wrapper.findAll('[data-section]'),
        dishes: () => wrapper.findAll('[data-dish]'),
        // El espacio que no parte la línea de «$ 18.500» se compara como uno común.
        prices: () => wrapper.findAll('[data-price]').map((price) => price.text().replaceAll(' ', ' ')),
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

describe('RestaurantMenu', () => {
    it('muestra las secciones en el orden del restaurante, cada una con sus platos', async () => {
        const { sections } = await mountMenu();

        expect(sections().map((section) => section.get('h3').text())).toEqual(['Platos fuertes (prueba)', 'Bebidas (prueba)']);
        expect(sections().map((section) => section.findAll('[data-name]').map((name) => name.text()))).toEqual([
            ['Sancocho de prueba', 'Bandeja de prueba'],
            ['Jugo de prueba'],
        ]);
    });

    it.each([
        ['es', ['$ 18.500', '$ 22.000', '$ 4.000']],
        ['en', ['COP 18,500', 'COP 22,000', 'COP 4,000']],
    ] as const)('en %s, cada plato lleva su precio en pesos como se escribe en ese idioma', async (locale, expected) => {
        const { prices } = await mountMenu(MENU, locale);

        expect(prices()).toEqual(expected);
    });

    it('muestra la descripción del plato, y sin descripción no deja el hueco', async () => {
        const { dishes } = await mountMenu();

        expect(dishes()[0]?.get('[data-description]').text()).toBe('Con arroz y aguacate.');
        expect(dishes()[1]?.find('[data-description]').exists()).toBe(false);
    });

    describe('agotado hoy', () => {
        it.each([
            ['es', 'Agotado hoy'],
            ['en', 'Sold out today'],
        ] as const)('en %s, el plato agotado sigue en el menú con su aviso y su precio', async (locale, text) => {
            const { dishes } = await mountMenu(MENU, locale);
            const soldOut = dishes()[1];

            expect(soldOut?.get('[data-name]').text()).toBe('Bandeja de prueba');
            expect(soldOut?.get('[data-sold-out]').text()).toBe(text);
            expect(soldOut?.find('[data-price]').exists()).toBe(true);
        });

        it('los que hay no llevan el aviso', async () => {
            const { wrapper } = await mountMenu();

            expect(wrapper.findAll('[data-sold-out]')).toHaveLength(1);
        });

        it('no lo dice solo con el color: el aviso es texto', async () => {
            const { dishes } = await mountMenu();

            expect(dishes()[1]?.get('[data-name]').classes()).toContain('text-ink-muted');
            expect(dishes()[1]?.text()).toContain('Agotado hoy');
        });

        it.each([
            ['ayer', '2026-10-06', false],
            ['hoy', '2026-10-07', true],
            ['mañana', '2026-10-08', true],
            ['ninguna fecha', null, false],
        ] as const)('agotado hasta %s: vale hasta su fecha, incluida', async (_until, date, soldOut) => {
            const { wrapper } = await mountMenu(soldOutUntil(date));

            expect(wrapper.find('[data-sold-out]').exists()).toBe(soldOut);
        });

        it('el día es el de Colombia, esté donde esté el teléfono', async () => {
            // 20:00 del 7 de octubre en Colombia: en UTC ya es 8.
            vi.setSystemTime(new Date('2026-10-08T01:00:00Z'));

            const { wrapper } = await mountMenu(soldOutUntil('2026-10-07'));

            expect(wrapper.find('[data-sold-out]').exists()).toBe(true);
        });

        it('una ficha que queda abierta de noche deja de decirlo al día siguiente', async () => {
            vi.setSystemTime(new Date('2026-10-07T23:50:00-05:00'));
            const { wrapper } = await mountMenu(soldOutUntil('2026-10-07'));

            expect(wrapper.find('[data-sold-out]').exists()).toBe(true);

            // Pasa la medianoche: el reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(11 * 60 * 1000);

            expect(wrapper.find('[data-sold-out]').exists()).toBe(false);
        });
    });

    describe('sin menú', () => {
        it.each([
            ['es', 'Este restaurante todavía no tiene el menú cargado.'],
            ['en', "This restaurant hasn't added its menu yet."],
        ] as const)('en %s lo dice, con el título de la sección y sin listas vacías', async (locale, text) => {
            const { wrapper } = await mountMenu([], locale);

            expect(wrapper.get('[data-empty]').text()).toBe(text);
            expect(wrapper.find('h2').exists()).toBe(true);
            expect(wrapper.find('h3').exists()).toBe(false);
            expect(wrapper.find('ul').exists()).toBe(false);
        });

        it('con menú no sale el aviso', async () => {
            const { wrapper } = await mountMenu();

            expect(wrapper.find('[data-empty]').exists()).toBe(false);
        });
    });

    describe('accesibilidad', () => {
        it.each([
            ['es', 'Menú'],
            ['en', 'Menu'],
        ] as const)('en %s es una sección con título de segundo nivel', async (locale, title) => {
            const { wrapper } = await mountMenu(MENU, locale);

            expect(wrapper.get('h2').text()).toBe(title);
            expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
        });

        it('cada sección del menú es un título de tercer nivel que nombra su lista de platos', async () => {
            const { sections } = await mountMenu();
            const ids = sections().map((section) => section.get('h3').attributes('id'));

            expect(new Set(ids).size).toBe(2);
            expect(sections().map((section) => section.get('ul').attributes('aria-labelledby'))).toEqual(ids);
        });
    });
});

/** El menú del contrato, con opciones: el sancocho pide proteína; la bandeja está agotada hoy. */
const WITH_OPTIONS: MenuSection[] = [
    {
        name: 'Platos fuertes (prueba)',
        dishes: [
            {
                name: 'Sancocho de prueba',
                description: null,
                price: 18500,
                sold_out_until: null,
                groups: [{ name: 'Proteína (prueba)', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res (prueba)', price: 0 }, { name: 'Cerdo (prueba)', price: 1000 }] }],
            },
            { name: 'Bandeja de prueba', description: null, price: 22000, sold_out_until: '2026-10-07', groups: [] },
            {
                name: 'Plato sin opciones suficientes',
                description: null,
                price: 15000,
                sold_out_until: null,
                groups: [{ name: 'Dos sopas', kind: 'choice', min: 2, max: 1, options: [{ name: 'Una sola', price: 0 }] }],
            },
            { name: 'Gaseosa de prueba', description: null, price: 3500, sold_out_until: null, groups: [] },
        ],
    },
];

describe('RestaurantMenu: armar el pedido (#14)', () => {
    afterEach(async () => {
        const { resetOrders } = await import('@/order/useOrder');
        resetOrders();
    });

    it('sin restaurante (slug) el menú solo se lee: ningún plato es un botón', async () => {
        const { wrapper } = await mountMenu(WITH_OPTIONS);

        expect(wrapper.findAll('button')).toHaveLength(0);
    });

    it('cada plato que se puede pedir hoy es un botón que abre un diálogo; el agotado y el imposible, no', async () => {
        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');

        expect(dishes().map((dish) => dish.find('[data-choose]').exists())).toEqual([true, false, false, true]);
        expect(nth(dishes(), 0).get('button').attributes('aria-haspopup')).toBe('dialog');
        expect(nth(dishes(), 1).find('[data-sold-out]').exists()).toBe(true);
        expect(nth(dishes(), 2).get('[data-unavailable]').text()).toBe('No disponible hoy');
        expect(wrapper.find('dialog').exists()).toBe(false);
    });

    it('el botón del plato tiene un área táctil de 44 px', async () => {
        const { dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');

        expect(nth(dishes(), 0).get('button').classes()).toContain('min-h-touch');
    });

    it('al agregar, cierra, devuelve el foco al plato, lo anuncia y muestra el pedido', async () => {
        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const opener = nth(dishes(), 0).get('button');

        opener.element.focus();
        await opener.trigger('click');
        await flushPromises();
        await vi.dynamicImportSettled();
        await flushPromises();

        const dialog = wrapper.get('dialog');
        expect(dialog.get('h2').text()).toBe('Sancocho de prueba');

        await nth(dialog.findAll('[data-option]'), 1).setValue(true);
        await dialog.get('form').trigger('submit');
        await flushPromises();

        expect(wrapper.find('dialog').exists()).toBe(false);
        expect(document.activeElement).toBe(opener.element);
        expect(wrapper.get('[data-order-announcement]').text()).toBe('Sancocho de prueba quedó en tu pedido.');
        expect(wrapper.get('[data-order-summary]').text().replace(/[\u00a0\u202f]/g, ' ')).toBe('Tu pedido: 1 plato · total estimado $ 19.500');
    });

    it('si no cabe todo, agrega hasta 20 y anuncia cuántas entraron', async () => {
        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const { useOrder } = await import('@/order/useOrder');
        useOrder('la-ceiba').add({ dish: 'Gaseosa de prueba', unitPrice: 3500, quantity: 15, choices: [], removed: [], note: null });

        await nth(dishes(), 3).get('button').trigger('click');
        await flushPromises();
        await vi.dynamicImportSettled();
        await flushPromises();

        for (let i = 1; i < 10; i++) {
            await wrapper.get('[data-increase]').trigger('click');
        }

        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(wrapper.get('[data-order-announcement]').text()).toBe('Solo caben 20 de Gaseosa de prueba en el pedido: se agregaron 5.');
        expect(useOrder('la-ceiba').count.value).toBe(20);
    });

    it('si el selector no se puede cargar, lo anuncia y no abre nada', async () => {
        vi.doMock('@/components/DishPicker.vue', () => {
            throw new Error('Sin conexión');
        });
        onTestFinished(() => {
            vi.doUnmock('@/components/DishPicker.vue');
        });

        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const opener = nth(dishes(), 3).get('button');

        opener.element.focus();
        await opener.trigger('click');
        await flushPromises();
        await vi.dynamicImportSettled();
        await flushPromises();

        expect(wrapper.find('dialog').exists()).toBe(false);
        expect(wrapper.get('[data-order-announcement]').text()).toBe('No se pudo abrir el plato. Revisá la conexión e intentá de nuevo.');
        expect(document.activeElement).toBe(opener.element);
    });

    it('cerrar sin agregar no cambia el pedido y devuelve el foco', async () => {
        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const opener = nth(dishes(), 3).get('button');

        await opener.trigger('click');
        await flushPromises();
        await vi.dynamicImportSettled();
        await flushPromises();
        await wrapper.get('[data-close]').trigger('click');
        await flushPromises();

        expect(wrapper.find('dialog').exists()).toBe(false);
        expect(wrapper.find('[data-order-summary]').exists()).toBe(false);
        expect(document.activeElement).toBe(opener.element);
    });
});
