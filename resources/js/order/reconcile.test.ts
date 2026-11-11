import { describe, expect, it } from 'vitest';

import type { MenuDish, MenuIngredient } from '@/restaurants/profile';
import { present } from '@/testing/present';

import { lineProblem } from './reconcile';
import { emptySelection, setSubstitute, toggleOption, toOrderItem, type OrderItem } from './selection';

const TODAY = '2026-11-01';
const TOMORROW = '2026-11-02';

function tomato(overrides: Partial<MenuIngredient> = {}): MenuIngredient {
    return { name: 'Tomate', essential: false, in_dish: true, sold_out_until: TODAY, substitute: null, ...overrides };
}

function bandeja(overrides: Partial<MenuDish> = {}): MenuDish {
    return {
        name: 'Bandeja de prueba',
        description: null,
        price: 22000,
        sold_out_until: null,
        ingredients: [],
        groups: [
            { name: 'Proteína', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res', price: 0, ingredient: null }] },
            { name: 'Adiciones', kind: 'choice', min: 0, max: 2, options: [{ name: 'Huevo', price: 1500, ingredient: null }] },
        ],
        photo: null,
        ...overrides,
    };
}

/** La línea que se guarda al agregar el plato con la proteína y un huevo. */
function line(dish: MenuDish, today: string = TODAY, accept?: boolean): OrderItem {
    let selection = toggleOption(emptySelection(dish), present(dish.groups[0]), 0, 0);
    selection = toggleOption(selection, present(dish.groups[1]), 1, 0);

    if (accept !== undefined) {
        selection = setSubstitute(selection, 0, accept);
    }

    return present(toOrderItem(dish, selection, today));
}

describe('lineProblem', () => {
    it('una línea recién agregada se puede enviar como está', () => {
        const dish = bandeja();

        expect(lineProblem(line(dish), [dish], TODAY)).toBeNull();
    });

    it('un plato que ya no está en la carta', () => {
        expect(lineProblem(line(bandeja()), [], TODAY)).toBe('gone');
    });

    it('reconoce el plato por su nombre en español; las opciones solo viajan en el idioma de la ficha', () => {
        const dish = bandeja();
        const english = bandeja({
            name: 'Test platter',
            name_es: dish.name,
            groups: [
                { name: 'Protein', kind: 'choice', min: 1, max: 1, options: [{ name: 'Beef', price: 0, ingredient: null }] },
                { name: 'Extras', kind: 'choice', min: 0, max: 2, options: [{ name: 'Egg', price: 1500, ingredient: null }] },
            ],
        });

        expect(lineProblem(line(dish), [{ ...dish, name: 'Test platter', name_es: dish.name }], TODAY)).toBeNull();
        expect(lineProblem(line(dish), [english], TODAY)).toBe('changed');
    });

    it('dos platos con el mismo nombre: la línea vale si cuadra con alguno que hoy se pueda pedir', () => {
        const cheap = bandeja({ price: 18000 });
        const dear = bandeja();
        const item = line(dear);

        expect(lineProblem(item, [cheap, dear], TODAY)).toBeNull();
        expect(lineProblem(item, [bandeja({ sold_out_until: TODAY }), dear], TODAY)).toBeNull();
        expect(lineProblem(item, [cheap], TODAY)).toBe('changed');
    });

    it('dos grupos con el mismo nombre: la opción del segundo se reconoce', () => {
        const extras = { name: 'Adiciones', kind: 'choice' as const, min: 0, max: 2, options: [{ name: 'Queso', price: 1000, ingredient: null }] };
        const dish = bandeja({ groups: [...bandeja().groups, extras] });
        const selection = toggleOption(toggleOption(emptySelection(dish), present(dish.groups[0]), 0, 0), extras, 2, 0);
        const item = present(toOrderItem(dish, selection, TODAY));

        expect(item.choices.map((choice) => choice.name)).toEqual(['Res', 'Queso']);
        expect(lineProblem(item, [dish], TODAY)).toBeNull();
    });

    it('un grupo obligatorio agregado después, o un «sin» que ya no se ofrece, deja la línea vieja', () => {
        const plain = bandeja({ groups: [] });
        const item = present(toOrderItem(plain, emptySelection(plain), TODAY));

        expect(lineProblem(item, [plain], TODAY)).toBeNull();
        expect(lineProblem(item, [bandeja()], TODAY)).toBe('changed');
        expect(lineProblem({ ...item, removed: ['Cebolla'] }, [plain], TODAY)).toBe('changed');
    });

    it('un plato que hoy está agotado, o al que le falta un esencial', () => {
        const item = line(bandeja());

        expect(lineProblem(item, [bandeja({ sold_out_until: TODAY })], TODAY)).toBe('unavailable');
        expect(lineProblem(item, [bandeja({ ingredients: [tomato({ essential: true })] })], TODAY)).toBe('unavailable');
    });

    it('un plato que cambió de precio, o una adición que cambió de precio o salió de la carta', () => {
        const dish = bandeja();
        const item = line(dish);
        const dearerEgg = bandeja({ groups: [present(dish.groups[0]), { ...present(dish.groups[1]), options: [{ name: 'Huevo', price: 2000, ingredient: null }] }] });
        const noEgg = bandeja({ groups: [present(dish.groups[0]), { ...present(dish.groups[1]), options: [] }] });

        expect(lineProblem(item, [bandeja({ price: 24000 })], TODAY)).toBe('changed');
        expect(lineProblem(item, [dearerEgg], TODAY)).toBe('changed');
        expect(lineProblem(item, [noEgg], TODAY)).toBe('changed');
    });

    it('«(no hay hoy)» de anoche deja de valer cuando hoy sí hay', () => {
        const yesterdayDish = bandeja({ ingredients: [tomato()] });
        const item = line(yesterdayDish);

        expect(item.missing).toEqual(['Tomate']);
        expect(lineProblem(item, [yesterdayDish], TODAY)).toBeNull();
        expect(lineProblem(item, [yesterdayDish], TOMORROW)).toBe('changed');
    });

    it('algo que se agotó después de agregar el plato', () => {
        const item = line(bandeja());

        expect(lineProblem(item, [bandeja({ ingredients: [tomato()] })], TODAY)).toBe('changed');
    });

    it('un reemplazo aceptado vale mientras siga siendo ese y a ese precio', () => {
        const substitute = { name: 'Pepino', price: 500, sold_out_until: null };
        const dish = bandeja({ ingredients: [tomato({ substitute })] });
        const item = line(dish, TODAY, true);

        expect(item.swaps).toEqual([{ name: 'Pepino', instead: 'Tomate', price: 500 }]);
        expect(lineProblem(item, [dish], TODAY)).toBeNull();
        expect(lineProblem(item, [bandeja({ ingredients: [tomato({ substitute: { ...substitute, price: 800 } })] })], TODAY)).toBe('changed');
        expect(lineProblem(item, [bandeja({ ingredients: [tomato({ substitute: { ...substitute, sold_out_until: TODAY } })] })], TODAY)).toBe('changed');
    });
});
