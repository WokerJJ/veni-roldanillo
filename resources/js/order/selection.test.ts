import { describe, expect, it } from 'vitest';

import type { MenuDish } from '@/restaurants/profile';
import { nth, present } from '@/testing/present';

import type { DishSelection, OrderItem } from './selection';
import {
    addItem,
    clampQuantity,
    emptySelection,
    groupProblem,
    isOrderable,
    isSingleChoice,
    isSoldOut,
    itemsCount,
    itemsTotal,
    linePrice,
    MAX_QUANTITY,
    normalizeNote,
    NOTE_MAX_LENGTH,
    sameLine,
    selectionProblems,
    toggleOption,
    toOrderItem,
    unitPrice,
} from './selection';

/** El sancocho del contrato de la ficha: proteína obligatoria, adiciones y quitar. */
function sancocho(overrides: Partial<MenuDish> = {}): MenuDish {
    return {
        name: 'Sancocho de prueba',
        description: null,
        price: 18500,
        sold_out_until: null,
        groups: [
            { name: 'Proteína', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res', price: 0 }, { name: 'Cerdo', price: 1000 }] },
            { name: 'Adiciones', kind: 'choice', min: 0, max: 2, options: [{ name: 'Huevo', price: 1500 }, { name: 'Aguacate', price: 2000 }, { name: 'Maduro', price: 1500 }] },
            { name: 'Quitar', kind: 'removal', min: 0, max: 2, options: [{ name: 'Cebolla', price: 0 }, { name: 'Cilantro', price: 0 }] },
        ],
        ...overrides,
    };
}

function choose(dish: MenuDish, picks: [number, number][], extra: Partial<DishSelection> = {}): DishSelection {
    let selection = emptySelection(dish);

    for (const [group, option] of picks) {
        const target = dish.groups[group];

        if (target !== undefined) {
            selection = toggleOption(selection, target, group, option);
        }
    }

    return { ...selection, ...extra };
}

describe('emptySelection', () => {
    it('empieza sin nada elegido, una unidad y sin nota', () => {
        expect(emptySelection(sancocho())).toEqual({ chosen: [[], [], []], note: '', quantity: 1 });
    });
});

describe('toggleOption', () => {
    const dish = sancocho();

    it('en un grupo de una sola opción, elegir otra suelta la anterior', () => {
        expect(choose(dish, [[0, 0], [0, 1]]).chosen[0]).toEqual([1]);
        expect(isSingleChoice(nth(dish.groups, 0))).toBe(true);
    });

    it('en los demás pone y saca, en el orden del menú', () => {
        expect(choose(dish, [[1, 1], [1, 0]]).chosen[1]).toEqual([0, 1]);
        expect(choose(dish, [[1, 1], [1, 0], [1, 1]]).chosen[1]).toEqual([0]);
    });

    it('con el grupo lleno, tocar otra no cambia nada', () => {
        const full = choose(dish, [[1, 0], [1, 1]]);

        expect(toggleOption(full, nth(dish.groups, 1), 1, 2)).toBe(full);
    });

    it('quitar no es de una sola opción aunque el tope sea uno', () => {
        expect(isSingleChoice({ name: 'Quitar', kind: 'removal', min: 0, max: 1, options: [{ name: 'Cebolla', price: 0 }] })).toBe(false);
    });

    it('no cambia la selección de entrada', () => {
        const before = emptySelection(dish);

        toggleOption(before, nth(dish.groups, 1), 1, 0);

        expect(before.chosen[1]).toEqual([]);
    });
});

describe('groupProblem y selectionProblems', () => {
    it('una obligatoria sin elegir falta; elegida, está bien', () => {
        const dish = sancocho();

        expect(selectionProblems(dish, emptySelection(dish))).toEqual([{ kind: 'missing', min: 1 }, null, null]);
        expect(selectionProblems(dish, choose(dish, [[0, 0]]))).toEqual([null, null, null]);
    });

    it('más de las que deja es un problema (si llegaran por otro camino)', () => {
        expect(groupProblem(nth(sancocho().groups, 1), [0, 1, 2])).toEqual({ kind: 'too_many', max: 2 });
    });

    it('un grupo que pide más opciones de las que hay no se puede cumplir', () => {
        expect(groupProblem({ name: 'Dos sopas', kind: 'choice', min: 2, max: 2, options: [{ name: 'Una', price: 0 }] }, [0])).toEqual({ kind: 'unavailable' });
    });
});

describe('isSoldOut e isOrderable', () => {
    it('«agotado hoy» vale hasta su fecha, incluida', () => {
        expect(isSoldOut(sancocho({ sold_out_until: '2026-10-07' }), '2026-10-07')).toBe(true);
        expect(isSoldOut(sancocho({ sold_out_until: '2026-10-06' }), '2026-10-07')).toBe(false);
        expect(isSoldOut(sancocho(), '2026-10-07')).toBe(false);
    });

    it('un plato agotado o con un grupo imposible no se puede agregar', () => {
        expect(isOrderable(sancocho(), '2026-10-07')).toBe(true);
        expect(isOrderable(sancocho({ sold_out_until: '2026-10-07' }), '2026-10-07')).toBe(false);
        expect(isOrderable(sancocho({ groups: [{ name: 'Dos sopas', kind: 'choice', min: 2, max: 2, options: [{ name: 'Una', price: 0 }] }] }), '2026-10-07')).toBe(false);
    });
});

describe('precio', () => {
    const dish = sancocho();

    it('sin adiciones es el del plato', () => {
        expect(unitPrice(dish, choose(dish, [[0, 0]]))).toBe(18500);
    });

    it('suma los recargos de lo elegido, pero quitar no cobra', () => {
        // Cerdo (+1.000), huevo (+1.500) y aguacate (+2.000), sin cebolla.
        expect(unitPrice(dish, choose(dish, [[0, 1], [1, 0], [1, 1], [2, 0]]))).toBe(23000);
    });

    it('la línea multiplica por la cantidad, en pesos enteros', () => {
        expect(linePrice(dish, choose(dish, [[0, 1], [1, 0]], { quantity: 3 }))).toBe(63000);
    });

    it('una opción quitada aunque traiga recargo no suma', () => {
        const odd = sancocho({ groups: [{ name: 'Quitar', kind: 'removal', min: 0, max: 1, options: [{ name: 'Cebolla', price: 500 }] }] });

        expect(unitPrice(odd, choose(odd, [[0, 0]]))).toBe(18500);
    });
});

describe('clampQuantity y normalizeNote', () => {
    it('la cantidad va de 1 a 20, entera', () => {
        expect(clampQuantity(0)).toBe(1);
        expect(clampQuantity(-4)).toBe(1);
        expect(clampQuantity(2.7)).toBe(2);
        expect(clampQuantity(99)).toBe(MAX_QUANTITY);
        expect(clampQuantity(Number.NaN)).toBe(1);
    });

    it('la nota queda sin espacios de más y no pasa del largo', () => {
        expect(normalizeNote('  sin   hielo\n por favor ')).toBe('sin hielo por favor');
        expect(normalizeNote('a'.repeat(NOTE_MAX_LENGTH + 30))).toHaveLength(NOTE_MAX_LENGTH);
    });
});

describe('toOrderItem', () => {
    const dish = sancocho();

    it('sin la obligatoria no hay ítem', () => {
        expect(toOrderItem(dish, emptySelection(dish))).toBeNull();
    });

    it('copia nombres y precios: elegido, quitado, nota y cantidad', () => {
        expect(toOrderItem(dish, choose(dish, [[0, 1], [1, 2], [2, 0], [2, 1]], { note: ' bien caliente ', quantity: 2 }))).toEqual({
            dish: 'Sancocho de prueba',
            unitPrice: 21000,
            quantity: 2,
            choices: [
                { group: 'Proteína', name: 'Cerdo', price: 1000 },
                { group: 'Adiciones', name: 'Maduro', price: 1500 },
            ],
            removed: ['Cebolla', 'Cilantro'],
            note: 'bien caliente',
        });
    });

    it('una nota en blanco queda en null', () => {
        expect(toOrderItem(dish, choose(dish, [[0, 0]], { note: '   ' }))?.note).toBeNull();
    });

    it('un plato sin grupos se agrega tal cual', () => {
        const juice = sancocho({ name: 'Gaseosa', price: 3500, groups: [] });

        expect(toOrderItem(juice, emptySelection(juice))).toEqual({ dish: 'Gaseosa', unitPrice: 3500, quantity: 1, choices: [], removed: [], note: null });
    });
});

describe('addItem, sameLine y totales', () => {
    const dish = sancocho();
    const beef = present(toOrderItem(dish, choose(dish, [[0, 0]])));
    const pork = present(toOrderItem(dish, choose(dish, [[0, 1]], { quantity: 2 })));

    it('una línea igual suma la cantidad; una distinta va aparte', () => {
        const items = addItem(addItem(addItem([], beef), pork), beef);

        expect(items.map((item) => [item.choices[0]?.name, item.quantity])).toEqual([
            ['Res', 2],
            ['Cerdo', 2],
        ]);
    });

    it('la nota o lo quitado hacen otra línea', () => {
        const noOnion = present(toOrderItem(dish, choose(dish, [[0, 0], [2, 0]])));
        const withNote: OrderItem = { ...beef, note: 'bien caliente' };

        expect(sameLine(beef, noOnion)).toBe(false);
        expect(sameLine(beef, withNote)).toBe(false);
        expect(sameLine(beef, { ...beef, quantity: 5 })).toBe(true);
    });

    it('sumar no pasa del tope de unidades', () => {
        expect(addItem([{ ...beef, quantity: 19 }], { ...beef, quantity: 5 })[0]?.quantity).toBe(MAX_QUANTITY);
    });

    it('el total y las unidades', () => {
        const items = [beef, pork];

        expect(itemsTotal(items)).toBe(18500 + 19500 * 2);
        expect(itemsCount(items)).toBe(3);
    });
});
