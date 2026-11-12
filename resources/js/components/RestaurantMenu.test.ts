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
            expect(wrapper.get('[data-empty] svg').attributes()).toMatchObject({ 'data-icon': 'veni/generico', 'aria-hidden': 'true' });
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

describe('RestaurantMenu: ingredientes agotados hoy (ADR 0033)', () => {
    function dish(name: string, ingredient: NonNullable<MenuSection['dishes'][number]['ingredients']>[number]): MenuSection['dishes'][number] {
        return { name, description: null, price: 20000, sold_out_until: null, ingredients: [ingredient], groups: [] };
    }

    const SECTIONS: MenuSection[] = [
        {
            name: 'Platos fuertes (prueba)',
            dishes: [
                dish('Bandeja de prueba', { name: 'Fríjoles', essential: true, in_dish: true, sold_out_until: '2026-10-07', substitute: null }),
                dish('Sancocho de prueba', { name: 'Cilantro', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: null }),
                dish('Arroz con pollo de prueba', { name: 'Tomate', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: { name: 'Pepino', price: 500, sold_out_until: null } }),
                dish('Ayer sin tomate', { name: 'Tomate', essential: true, in_dish: true, sold_out_until: '2026-10-06', substitute: null }),
            ],
        },
    ];

    it('muestra los tres casos y el esencial no se puede pedir', async () => {
        const { dishes } = await mountMenu(SECTIONS, 'es', 'prueba-la-ceiba');
        const [bandeja, sancocho, arroz, ayer] = dishes();

        expect(bandeja?.get('[data-unavailable]').text()).toBe('No disponible hoy · sin Fríjoles');
        expect(bandeja?.find('[data-choose]').exists()).toBe(false);
        // Si no se puede pedir, no dice qué traería en lugar de qué.
        expect(bandeja?.find('[data-ingredient-note]').exists()).toBe(false);
        expect(sancocho?.get('[data-ingredient-note]').text()).toBe('Hoy sin Cilantro');
        expect(sancocho?.find('[data-choose]').exists()).toBe(true);
        expect(arroz?.get('[data-ingredient-note]').text()).toBe('Hoy con Pepino en lugar de Tomate');
        expect(ayer?.find('[data-ingredient-note]').exists()).toBe(false);
        expect(ayer?.find('[data-choose]').exists()).toBe(true);
    });

    it('en inglés', async () => {
        const { dishes } = await mountMenu(SECTIONS, 'en', 'prueba-la-ceiba');

        expect(dishes()[0]?.get('[data-unavailable]').text()).toBe('Unavailable today · no Fríjoles');
        expect(dishes()[2]?.get('[data-ingredient-note]').text()).toBe('Today with Pepino instead of Tomate');
    });
});

describe('RestaurantMenu: fotos de los platos (#113)', () => {
    it('cada plato lleva su miniatura del mismo tamaño; sin foto, el ícono', async () => {
        const photo = { src: '/storage/media/dishes/0123456789abcdef0123-480.webp', srcset: '/storage/media/dishes/0123456789abcdef0123-192.webp 192w' };
        const withPhoto: MenuSection[] = MENU.map((section, index) => ({
            ...section,
            dishes: section.dishes.map((dish, position) => (index === 0 && position === 0 ? { ...dish, photo } : dish)),
        }));
        const { dishes } = await mountMenu(withPhoto);

        const kinds = dishes().map((dish) => dish.get('[data-photo]').attributes('data-photo'));
        expect(kinds).toEqual(['image', 'placeholder', 'placeholder']);
        expect(dishes().every((dish) => dish.get('[data-photo]').classes().includes('dish-photo-thumb'))).toBe(true);
        // Junto al nombre y dentro del mismo botón: no se lee dos veces.
        expect(dishes()[0]?.get('img').attributes('alt')).toBe('');
    });
});

describe('RestaurantMenu: chips de ingredientes (#115, ADR 0036)', () => {
    const SECTIONS: MenuSection[] = [
        {
            name: 'Platos fuertes (prueba)',
            dishes: [
                {
                    name: 'Arroz con pollo de prueba',
                    description: null,
                    price: 20000,
                    sold_out_until: null,
                    ingredients: [
                        { name: 'Cilantro', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: null },
                        { name: 'Tomate', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: { name: 'Pepino', price: 500, sold_out_until: null } },
                    ],
                    contains: [
                        { name: 'Arroz', ingredient: null },
                        { name: 'Cilantro', ingredient: 0 },
                        { name: 'Tomate', ingredient: 1 },
                    ],
                    groups: [],
                },
            ],
        },
    ];

    it('ícono y nombre de cada uno; el que falta, atenuado y dicho en texto; el reemplazo, resaltado con su recargo', async () => {
        const { dishes } = await mountMenu(SECTIONS, 'es', 'prueba-la-ceiba');
        const dish = nth(dishes(), 0);
        const chips = dish.findAll('[data-ingredient-chip]');

        expect(chips.map((chip) => chip.attributes('data-ingredient-chip'))).toEqual(['present', 'missing', 'swap']);
        expect(chips.map((chip) => chip.text().replaceAll(/\s+/g, ' ').trim())).toEqual([
            'Arroz,',
            'Cilantro · no hay hoy,',
            'Pepino en lugar de Tomate · +$ 500',
        ]);
        expect(nth(chips, 1).find('s').text()).toBe('Cilantro');
        expect(nth(chips, 1).classes()).toContain('ingredient-chip-missing');
        expect(nth(chips, 2).classes()).toContain('ingredient-chip-swap');
        // Cada ícono es decorativo, con su texto al lado; el del reemplazo es el del reemplazo.
        expect(chips.every((chip) => chip.get('svg').attributes('aria-hidden') === 'true')).toBe(true);
        expect(nth(chips, 2).get('svg').attributes('data-icon')).toBe('veni/generico');
        // Lo que ya dice un chip no se repite como aviso aparte.
        expect(dish.find('[data-ingredient-note]').exists()).toBe(false);
        // El botón del plato los nombra, con su encabezado y separados.
        expect(dish.get('[data-choose]').text()).toContain('Ingredientes:');
    });

    it('en inglés', async () => {
        const { dishes } = await mountMenu(SECTIONS, 'en', 'prueba-la-ceiba');
        const chips = nth(dishes(), 0).findAll('[data-ingredient-chip]');

        expect(nth(chips, 1).text()).toContain('out today');
        expect(nth(chips, 2).text()).toContain('Pepino instead of Tomate');
    });

    it('una ficha guardada antes, sin `contains`, no muestra chips y sigue con sus avisos', async () => {
        const [section] = SECTIONS;
        const old: MenuSection[] = section ? [{ ...section, dishes: section.dishes.map(({ name, description, price, sold_out_until, ingredients = [], groups }) => ({ name, description, price, sold_out_until, ingredients, groups })) }] : [];
        const { dishes } = await mountMenu(old, 'es', 'prueba-la-ceiba');

        expect(nth(dishes(), 0).find('[data-ingredient-chips]').exists()).toBe(false);
        expect(nth(dishes(), 0).findAll('[data-ingredient-note]').map((note) => note.text())).toEqual(['Hoy sin Cilantro', 'Hoy con Pepino en lugar de Tomate']);
    });
});

describe('RestaurantMenu: chips en un plato que no se puede pedir y avisos que no son chip (EVA-024)', () => {
    const RICE = { name: 'Arroz', essential: true, in_dish: true, sold_out_until: '2026-10-07', substitute: null };

    it('agotado hoy, los chips siguen debajo del nombre, fuera del botón', async () => {
        const { dishes } = await mountMenu([
            {
                name: 'Platos fuertes (prueba)',
                dishes: [{ name: 'Bandeja de prueba', description: null, price: 22000, sold_out_until: '2026-10-07', ingredients: [], contains: [{ name: 'Fríjoles', ingredient: null }], groups: [] }],
            },
        ]);
        const dish = nth(dishes(), 0);

        expect(dish.find('[data-choose]').exists()).toBe(false);
        expect(dish.find('[data-sold-out]').exists()).toBe(true);
        expect(dish.findAll('[data-ingredient-chip]').map((chip) => chip.attributes('data-ingredient-chip'))).toEqual(['present']);
    });

    it('sin un esencial ni reemplazo, el chip dice que falta y el aviso del plato no se repite como nota', async () => {
        const { dishes } = await mountMenu([
            {
                name: 'Platos fuertes (prueba)',
                dishes: [
                    {
                        name: 'Arroz con pollo de prueba',
                        description: null,
                        price: 20000,
                        sold_out_until: null,
                        ingredients: [RICE],
                        contains: [
                            { name: 'Arroz', ingredient: 0 },
                            { name: 'Pollo', ingredient: null },
                        ],
                        groups: [],
                    },
                ],
            },
        ]);
        const dish = nth(dishes(), 0);

        expect(dish.find('[data-choose]').exists()).toBe(false);
        expect(dish.get('[data-unavailable]').text()).toContain('Arroz');
        expect(dish.findAll('[data-ingredient-chip]').map((chip) => chip.attributes('data-ingredient-chip'))).toEqual(['missing', 'present']);
        expect(dish.find('[data-ingredient-note]').exists()).toBe(false);
    });

    it('un «Quitar» que no está vinculado al plato (`in_dish: false`) sigue como aviso de texto, aunque haya chips', async () => {
        const { dishes } = await mountMenu([
            {
                name: 'Platos fuertes (prueba)',
                dishes: [
                    {
                        name: 'Sancocho de prueba',
                        description: null,
                        price: 18500,
                        sold_out_until: null,
                        // Solo lo nombra el «Quitar»: lo lleva, pero no está en `contains`.
                        ingredients: [{ name: 'Cilantro', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: null }],
                        contains: [{ name: 'Yuca', ingredient: null }],
                        groups: [{ name: 'Quitar (prueba)', kind: 'removal', min: 0, max: 1, options: [{ name: 'Cilantro', price: 0, ingredient: 0 }] }],
                    },
                ],
            },
        ]);
        const dish = nth(dishes(), 0);

        expect(dish.findAll('[data-ingredient-chip]').map((chip) => chip.text().trim())).toEqual(['Yuca']);
        expect(dish.findAll('[data-ingredient-note]').map((note) => note.text())).toEqual(['Hoy sin Cilantro']);
    });
});

describe('RestaurantMenu: el ícono no cambia con el idioma (BUG-025)', () => {
    it('en inglés, el plato sin foto y los chips usan el ícono del nombre en español', async () => {
        const { dishes } = await mountMenu(
            [
                {
                    name: 'Main dishes (test)',
                    dishes: [
                        {
                            name: 'Hen soup',
                            name_es: 'Sancocho de gallina',
                            description: null,
                            price: 18500,
                            sold_out_until: null,
                            photo: null,
                            ingredients: [],
                            contains: [{ name: 'Rice', name_es: 'Arroz', ingredient: null }],
                            groups: [],
                        },
                    ],
                },
            ],
            'en',
        );
        const dish = nth(dishes(), 0);

        expect(dish.get('[data-photo="placeholder"] svg').attributes('data-icon')).toBe('sancocho');
        expect(dish.get('[data-name]').text()).toBe('Hen soup');
        expect(dish.get('[data-ingredient-chip]').text().trim()).toBe('Rice');
    });
});

describe('RestaurantMenu: el «+» y los chips en una línea (#141, M8)', () => {
    afterEach(async () => {
        const { resetOrders } = await import('@/order/useOrder');
        resetOrders();
    });

    it('el plato sin nada que elegir tiene su «+»: agrega una unidad sin abrir el detalle y lo anuncia', async () => {
        const { wrapper, dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const quick = nth(dishes(), 3).get('[data-quick-add]');

        expect(quick.attributes('aria-label')).toBe('Agregar Gaseosa de prueba al pedido');
        expect(quick.classes()).toContain('size-touch');

        await quick.trigger('click');
        await flushPromises();

        expect(wrapper.find('dialog').exists()).toBe(false);
        expect(wrapper.get('[data-order-announcement]').text()).toBe('Gaseosa de prueba quedó en tu pedido.');
        expect(wrapper.get('[data-order-summary]').text().replace(/[\u00a0\u202f]/g, ' ')).toBe('Tu pedido: 1 plato · total estimado $ 3.500');

        await quick.trigger('click');

        expect(wrapper.get('[data-order-summary]').text().replace(/[\u00a0\u202f]/g, ' ')).toBe('Tu pedido: 2 platos · total estimado $ 7.000');
    });

    it('con un grupo obligatorio, agotado, imposible de pedir o sin restaurante no hay «+»: solo el detalle', async () => {
        const { dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');

        expect(dishes().map((dish) => dish.find('[data-quick-add]').exists())).toEqual([false, false, false, true]);

        const { wrapper } = await mountMenu(WITH_OPTIONS);

        expect(wrapper.find('[data-quick-add]').exists()).toBe(false);
    });

    it('una adición opcional no impide el «+»; un ingrediente con reemplazo, sí', async () => {
        const dishes: MenuSection[] = [
            {
                name: 'Platos fuertes (prueba)',
                dishes: [
                    {
                        name: 'Con adición',
                        description: null,
                        price: 10000,
                        sold_out_until: null,
                        groups: [{ name: 'Extras', kind: 'choice', min: 0, max: 2, options: [{ name: 'Huevo', price: 2000 }] }],
                    },
                    {
                        name: 'Con reemplazo',
                        description: null,
                        price: 12000,
                        sold_out_until: null,
                        ingredients: [{ name: 'Tomate', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: { name: 'Pepino', price: 500, sold_out_until: null } }],
                        contains: [{ name: 'Tomate', ingredient: 0 }],
                        groups: [],
                    },
                ],
            },
        ];
        const { dishes: rows } = await mountMenu(dishes, 'es', 'la-ceiba');

        expect(rows().map((dish) => dish.find('[data-quick-add]').exists())).toEqual([true, false]);
    });

    it('el plato lleva el texto a la izquierda y la foto a la derecha', async () => {
        const { dishes } = await mountMenu(WITH_OPTIONS, 'es', 'la-ceiba');
        const children = [...nth(dishes(), 0).get('[data-choose]').element.children];

        expect(children[0]?.querySelector('[data-name]')).not.toBeNull();
        expect(children[children.length - 1]?.getAttribute('data-photo')).not.toBeNull();
    });

    const PRESENT = ['Arroz', 'Pollo', 'Papa', 'Cebolla', 'Ajo'].map((name) => ({ name, ingredient: null }));

    it('con más de tres ingredientes, tres y «+n» por el resto, dicho también a un lector de pantalla', async () => {
        const sections: MenuSection[] = [{ name: 'Platos fuertes (prueba)', dishes: [{ name: 'Plato largo', description: null, price: 9000, sold_out_until: null, contains: PRESENT, groups: [] }] }];
        const { dishes } = await mountMenu(sections, 'es', 'la-ceiba');
        const dish = nth(dishes(), 0);

        expect(dish.findAll('[data-ingredient-chip]').map((chip) => chip.text().replaceAll(/\s+/g, ' ').trim())).toEqual(['Arroz,', 'Pollo,', 'Papa,']);
        expect(dish.get('[data-ingredient-more]').text()).toContain('+2');
        expect(dish.get('[data-ingredient-more]').text()).toContain('y 2 más');
        expect(dish.get('[data-ingredient-chips]').classes()).toContain('ingredient-chips-line');
    });

    it('lo que hoy no hay sale siempre, aunque pase del tope, y la fila puede partirse', async () => {
        const sections: MenuSection[] = [
            {
                name: 'Platos fuertes (prueba)',
                dishes: [
                    {
                        name: 'Plato con falta',
                        description: null,
                        price: 9000,
                        sold_out_until: null,
                        ingredients: [{ name: 'Ajo', essential: false, in_dish: true, sold_out_until: '2026-10-07', substitute: null }],
                        contains: [...PRESENT.slice(0, 4), { name: 'Ajo', ingredient: 0 }],
                        groups: [],
                    },
                ],
            },
        ];
        const { dishes } = await mountMenu(sections, 'es', 'la-ceiba');
        const dish = nth(dishes(), 0);

        expect(dish.findAll('[data-ingredient-chip]').map((chip) => chip.attributes('data-ingredient-chip'))).toEqual(['present', 'present', 'missing']);
        expect(dish.get('[data-ingredient-more]').text()).toContain('+2');
        expect(dish.get('[data-ingredient-chips]').classes()).not.toContain('ingredient-chips-line');
    });

    it('con tres o menos no hay «+n»', async () => {
        const sections: MenuSection[] = [{ name: 'Platos fuertes (prueba)', dishes: [{ name: 'Plato corto', description: null, price: 9000, sold_out_until: null, contains: PRESENT.slice(0, 3), groups: [] }] }];
        const { dishes } = await mountMenu(sections, 'es', 'la-ceiba');

        expect(nth(dishes(), 0).find('[data-ingredient-more]').exists()).toBe(false);
    });
});
