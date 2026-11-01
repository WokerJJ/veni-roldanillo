import { describe, expect, it } from 'vitest';

import type { MenuDish, MenuIngredient } from '@/restaurants/profile';
import { nth, present } from '@/testing/present';

import { profile } from '@/testing/restaurants';

import { blockingIngredient, ingredientEffects, isIngredientOut, isOptionOut, isOptionSubstituted } from './ingredients';
import {
    acceptsSubstitute,
    addItem,
    availableOptions,
    emptySelection,
    isOptionChosen,
    isOptionLocked,
    isOrderable,
    linePrice,
    sameLine,
    selectionProblems,
    setSubstitute,
    toggleOption,
    toOrderItem,
    unavailableReason,
    unitPrice,
} from './selection';

const TODAY = '2026-11-01';
const YESTERDAY = '2026-10-31';

function ingredient(overrides: Partial<MenuIngredient> = {}): MenuIngredient {
    return { name: 'Tomate', essential: false, in_dish: true, sold_out_until: TODAY, substitute: null, ...overrides };
}

/**
 * Una bandeja con proteína obligatoria, adiciones (el aguacate es un
 * ingrediente) y quitar (la cebolla también), y la lista de ingredientes
 * agotados que la ficha publica (ADR 0033).
 */
function bandeja(ingredients: MenuIngredient[], links: { aguacate?: number; cebolla?: number } = {}): MenuDish {
    return {
        name: 'Bandeja de prueba',
        description: null,
        price: 22000,
        sold_out_until: null,
        ingredients,
        groups: [
            { name: 'Proteína', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res', price: 0, ingredient: null }] },
            {
                name: 'Adiciones',
                kind: 'choice',
                min: 0,
                max: 2,
                options: [
                    { name: 'Huevo', price: 1500, ingredient: null },
                    { name: 'Aguacate', price: 2000, ingredient: links.aguacate ?? null },
                ],
            },
            {
                name: 'Quitar',
                kind: 'removal',
                min: 0,
                max: 2,
                options: [
                    { name: 'Cebolla', price: 0, ingredient: links.cebolla ?? null },
                    { name: 'Cilantro', price: 0, ingredient: null },
                ],
            },
        ],
    };
}

/** Con la proteína elegida, lo mínimo para agregarla. */
function withProtein(dish: MenuDish) {
    const protein = dish.groups[0];

    return protein === undefined ? emptySelection(dish) : toggleOption(emptySelection(dish), protein, 0, 0);
}

describe('ingredientes agotados hoy', () => {
    it('vale hasta su fecha, incluida; ayer ya no cuenta', () => {
        const dish = bandeja([ingredient(), ingredient({ name: 'Arroz', sold_out_until: YESTERDAY })]);

        expect(isIngredientOut(dish, 0, TODAY)).toBe(true);
        expect(isIngredientOut(dish, 1, TODAY)).toBe(false);
        expect(isIngredientOut(dish, 7, TODAY)).toBe(false);
        expect(ingredientEffects(dish, TODAY)).toEqual([{ kind: 'without', index: 0, name: 'Tomate' }]);
    });

    it('sin día, o con una ficha que no trae ingredientes, el plato no cambia', () => {
        const dish = bandeja([ingredient({ essential: true })]);
        const legacy: MenuDish = { ...dish };
        delete legacy.ingredients;

        expect(ingredientEffects(dish, undefined)).toEqual([]);
        expect(ingredientEffects(legacy, TODAY)).toEqual([]);
        expect(isOrderable(legacy, TODAY)).toBe(true);
    });

    it('esencial: el plato no se puede pedir hoy y dice cuál falta', () => {
        const dish = bandeja([ingredient({ name: 'Fríjoles', essential: true })]);

        expect(blockingIngredient(dish, TODAY)).toBe('Fríjoles');
        expect(isOrderable(dish, TODAY)).toBe(false);
        expect(toOrderItem(dish, withProtein(dish), TODAY)).toBeNull();
        // Mañana vuelve solo.
        expect(isOrderable(dish, '2026-11-02')).toBe(true);
    });

    it('no esencial sin reemplazo: va «sin X (no hay hoy)» y el «Quitar» queda marcado y fijo', () => {
        const dish = bandeja([ingredient({ name: 'Cebolla' })], { cebolla: 0 });
        const selection = withProtein(dish);

        expect(isOrderable(dish, TODAY)).toBe(true);
        expect(isOptionLocked(dish, 2, 0, TODAY)).toBe(true);
        expect(isOptionChosen(dish, selection, 2, 0, TODAY)).toBe(true);
        expect(isOptionChosen(dish, selection, 2, 1, TODAY)).toBe(false);

        const item = toOrderItem(dish, selection, TODAY);

        expect(item?.removed).toEqual([]);
        expect(item?.missing).toEqual(['Cebolla']);
        expect(item?.swaps).toBeUndefined();
        expect(item?.unitPrice).toBe(22000);
    });

    it('con reemplazo: se acepta por defecto y suma el recargo; rechazado va sin nada', () => {
        const dish = bandeja([ingredient({ substitute: { name: 'Pepino', price: 500, sold_out_until: null } })]);
        const accepted = withProtein(dish);

        expect(ingredientEffects(dish, TODAY)).toEqual([{ kind: 'substitute', index: 0, name: 'Tomate', substitute: 'Pepino', price: 500, required: false }]);
        expect(acceptsSubstitute(accepted, 0)).toBe(true);
        expect(unitPrice(dish, accepted, TODAY)).toBe(22500);
        expect(linePrice(dish, { ...accepted, quantity: 3 }, TODAY)).toBe(67500);
        expect(toOrderItem(dish, accepted, TODAY)).toEqual({
            dish: 'Bandeja de prueba',
            unitPrice: 22500,
            quantity: 1,
            choices: [{ group: 'Proteína', name: 'Res', price: 0 }],
            removed: [],
            swaps: [{ name: 'Pepino', instead: 'Tomate', price: 500 }],
            note: null,
        });

        const declined = setSubstitute(accepted, 0, false);

        expect(acceptsSubstitute(declined, 0)).toBe(false);
        expect(unitPrice(dish, declined, TODAY)).toBe(22000);
        expect(toOrderItem(dish, declined, TODAY)?.missing).toEqual(['Tomate']);
        expect(acceptsSubstitute(setSubstitute(declined, 0, true), 0)).toBe(true);
    });

    it('esencial con un reemplazo vigente: el plato sale con el reemplazo, sin poder pedirlo sin nada (EVA-003)', () => {
        const dish = bandeja([ingredient({ name: 'Res', essential: true, substitute: { name: 'Cerdo', price: 1000, sold_out_until: YESTERDAY } })]);
        const selection = withProtein(dish);

        expect(ingredientEffects(dish, TODAY)).toEqual([{ kind: 'substitute', index: 0, name: 'Res', substitute: 'Cerdo', price: 1000, required: true }]);
        expect(blockingIngredient(dish, TODAY)).toBeNull();
        expect(isOrderable(dish, TODAY)).toBe(true);
        expect(unavailableReason(dish, TODAY)).toBeNull();

        // Aunque una selección vieja lo traiga rechazado, va con el reemplazo.
        const declined = setSubstitute(selection, 0, false);

        for (const current of [selection, declined]) {
            const item = toOrderItem(dish, current, TODAY);

            expect(item?.swaps).toEqual([{ name: 'Cerdo', instead: 'Res', price: 1000 }]);
            expect(item?.missing).toBeUndefined();
            expect(item?.unitPrice).toBe(23000);
        }
    });

    it('esencial con el reemplazo también agotado: el plato no se puede pedir (EVA-003)', () => {
        const dish = bandeja([ingredient({ name: 'Res', essential: true, substitute: { name: 'Cerdo', price: 1000, sold_out_until: TODAY } })]);

        expect(ingredientEffects(dish, TODAY)).toEqual([{ kind: 'blocks', index: 0, name: 'Res' }]);
        expect(blockingIngredient(dish, TODAY)).toBe('Res');
        expect(isOrderable(dish, TODAY)).toBe(false);
        expect(unavailableReason(dish, TODAY)).toEqual({ reason: 'ingredient', name: 'Res' });
    });

    it('por qué no se puede pedir: agotado, un ingrediente o las opciones (EVA-004)', () => {
        expect(unavailableReason(bandeja([]), TODAY)).toBeNull();
        expect(unavailableReason({ ...bandeja([]), sold_out_until: TODAY }, TODAY)).toEqual({ reason: 'sold_out' });
        expect(unavailableReason(bandeja([ingredient({ name: 'Fríjoles', essential: true })]), TODAY)).toEqual({ reason: 'ingredient', name: 'Fríjoles' });

        const noProtein = bandeja([]);
        noProtein.groups = noProtein.groups.map((group, index) => (index === 0 ? { ...group, options: [] } : group));

        expect(unavailableReason(noProtein, TODAY)).toEqual({ reason: 'options' });
    });

    it('con reemplazo, el «Quitar» de ese ingrediente lo decide el reemplazo; sin reemplazo, no (EVA-005)', () => {
        const swapped = bandeja([ingredient({ name: 'Cebolla', substitute: { name: 'Cebollín', price: 0, sold_out_until: null } })], { cebolla: 0 });
        const without = bandeja([ingredient({ name: 'Cebolla' })], { cebolla: 0 });

        expect(isOptionSubstituted(swapped, 2, 0, TODAY)).toBe(true);
        expect(isOptionSubstituted(swapped, 2, 1, TODAY)).toBe(false);
        expect(isOptionSubstituted(without, 2, 0, TODAY)).toBe(false);
        expect(isOptionSubstituted(swapped, 2, 0, undefined)).toBe(false);
    });

    it('lee el contrato de la ficha: la cebolla agotada del sancocho va con cebollín y su «Quitar» la nombra (EVA-002)', () => {
        const sancocho = present(nth(present(nth(profile().menu, 0)).dishes, 0));
        const removal = sancocho.groups.findIndex((group) => group.kind === 'removal');

        expect(ingredientEffects(sancocho, '2026-10-07')).toEqual([
            { kind: 'substitute', index: 0, name: 'Cebolla (prueba)', substitute: 'Cebollín (prueba)', price: 500, required: false },
        ]);
        expect(present(nth(present(nth(sancocho.groups, removal)).options, 0)).ingredient).toBe(0);
        expect(isOptionSubstituted(sancocho, removal, 0, '2026-10-07')).toBe(true);
        // Al otro día ya hay: el plato no cambia.
        expect(ingredientEffects(sancocho, '2026-10-08')).toEqual([]);
    });

    it('un reemplazo que también está agotado no se ofrece', () => {
        const dish = bandeja([ingredient({ substitute: { name: 'Pepino', price: 500, sold_out_until: TODAY } })]);

        expect(ingredientEffects(dish, TODAY)).toEqual([{ kind: 'without', index: 0, name: 'Tomate' }]);
        expect(unitPrice(dish, withProtein(dish), TODAY)).toBe(22000);
    });

    it('una adición agotada no se puede elegir, no cobra y no cuenta para el tope', () => {
        const dish = bandeja([ingredient({ name: 'Aguacate', in_dish: false })], { aguacate: 0 });
        const adiciones = nth(dish.groups, 1);

        expect(isOptionOut(dish, nth(adiciones.options, 1), TODAY)).toBe(true);
        expect(isOptionLocked(dish, 1, 1, TODAY)).toBe(true);
        expect(availableOptions(dish, adiciones, TODAY)).toBe(1);
        // Solo la nombra una adición: el plato no dice «Hoy sin Aguacate».
        expect(ingredientEffects(dish, TODAY)).toEqual([]);

        // Elegida antes de agotarse: ya no se ve marcada ni suma.
        const selection = toggleOption(withProtein(dish), adiciones, 1, 1);

        expect(isOptionChosen(dish, selection, 1, 1, TODAY)).toBe(false);
        expect(unitPrice(dish, selection, TODAY)).toBe(22000);
        expect(toOrderItem(dish, selection, TODAY)?.choices).toEqual([{ group: 'Proteína', name: 'Res', price: 0 }]);
        expect(selectionProblems(dish, selection, TODAY)).toEqual([null, null, null]);
    });

    it('un grupo obligatorio cuyas opciones están agotadas deja el plato «No disponible hoy»', () => {
        const dish = bandeja([ingredient({ name: 'Res', in_dish: false })]);
        nth(nth(dish.groups, 0).options, 0).ingredient = 0;

        expect(isOrderable(dish, TODAY)).toBe(false);
        expect(selectionProblems(dish, emptySelection(dish), TODAY)[0]).toEqual({ kind: 'unavailable' });
    });

    it('dos líneas iguales salvo el reemplazo no se juntan', () => {
        const dish = bandeja([ingredient({ substitute: { name: 'Pepino', price: 500, sold_out_until: null } })]);
        const accepted = toOrderItem(dish, withProtein(dish), TODAY);
        const declined = toOrderItem(dish, setSubstitute(withProtein(dish), 0, false), TODAY);

        const a = present(accepted);
        const b = present(declined);

        expect(sameLine(a, b)).toBe(false);
        expect(sameLine(a, { ...a, quantity: 4 })).toBe(true);
        expect(addItem([a], b)).toHaveLength(2);
    });
});
