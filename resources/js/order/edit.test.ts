import { describe, expect, it } from 'vitest';

import type { MenuDish } from '@/restaurants/profile';

import type { OrderItem } from './selection';
import { addItem, replaceItem, selectionFromItem, selectionProblems, toOrderItem } from './selection';

const TODAY = '2026-11-27';

const DISH: MenuDish = {
    name: 'Sancocho de prueba',
    description: null,
    price: 18500,
    sold_out_until: null,
    ingredients: [],
    groups: [
        { name: 'Proteína', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res', price: 0, ingredient: null }, { name: 'Cerdo', price: 1000, ingredient: null }] },
        { name: 'Adiciones', kind: 'choice', min: 0, max: 2, options: [{ name: 'Huevo', price: 500, ingredient: null }] },
        { name: 'Quitar', kind: 'removal', min: 0, max: 1, options: [{ name: 'Cebolla', price: 0, ingredient: null }] },
    ],
    photo: null,
};

const LINE: OrderItem = {
    dish: DISH.name,
    unitPrice: 20000,
    quantity: 2,
    choices: [
        { group: 'Proteína', name: 'Cerdo', price: 1000 },
        { group: 'Adiciones', name: 'Huevo', price: 500 },
    ],
    removed: ['Cebolla'],
    note: 'bien caliente',
};

describe('selectionFromItem', () => {
    it('reconstruye lo elegido: guardar sin tocar nada deja la misma línea', () => {
        const selection = selectionFromItem(DISH, LINE, TODAY);

        expect(selection.chosen).toEqual([[1], [0], [0]]);
        expect(toOrderItem(DISH, selection, TODAY)).toEqual(LINE);
    });

    it('lo que ya no está en la carta no se marca', () => {
        const gone: OrderItem = { ...LINE, choices: [{ group: 'Adiciones', name: 'Aguacate', price: 900 }], removed: [] };

        expect(selectionFromItem(DISH, gone, TODAY).chosen).toEqual([[], [], []]);
    });

    it('una opción hoy agotada no queda marcada ni llena el grupo', () => {
        const dish: MenuDish = {
            ...DISH,
            ingredients: [{ name: 'Huevo', in_dish: false, essential: false, sold_out_until: TODAY, substitute: null }],
            groups: [{ name: 'Adiciones', kind: 'choice', min: 0, max: 1, options: [{ name: 'Huevo', price: 500, ingredient: 0 }, { name: 'Queso', price: 800, ingredient: null }] }],
        };
        const line: OrderItem = { ...LINE, choices: [{ group: 'Adiciones', name: 'Huevo', price: 500 }], removed: [] };
        const recovered = selectionFromItem(dish, line, TODAY);

        expect(recovered.chosen).toEqual([[]]);
        expect(recovered.lost).toEqual([{ kind: 'choice', name: 'Huevo' }]);
        expect(selectionProblems(dish, recovered, TODAY)).toEqual([null]);
    });

    it('devuelve lo que no reconoce: opciones, quitados y el reemplazo rechazado', () => {
        const line: OrderItem = { ...LINE, choices: [{ group: 'Protein', name: 'Pork', price: 1000 }], removed: ['Onion'], missing: ['Tomato'] };

        expect(selectionFromItem(DISH, line, TODAY).lost).toEqual([
            { kind: 'choice', name: 'Pork' },
            { kind: 'without', name: 'Onion' },
            { kind: 'without', name: 'Tomato' },
        ]);
        expect(selectionFromItem(DISH, LINE, TODAY).lost).toEqual([]);
    });
});

describe('replaceItem', () => {
    const other: OrderItem = { ...LINE, removed: [], quantity: 19 };

    it('cambia la línea en su lugar', () => {
        const next: OrderItem = { ...LINE, note: null };

        expect(replaceItem([other, LINE], 1, next)).toEqual([other, next]);
    });

    it('si queda igual a otra, se juntan sin pasar del tope', () => {
        expect(replaceItem([other, LINE], 1, { ...other, quantity: 2 })).toEqual([{ ...other, quantity: 20 }]);
    });

    it('al juntar líneas se conserva el aviso de alcohol de cualquiera', () => {
        const drink: OrderItem = { ...other, quantity: 1, alcohol: true };
        const soft: OrderItem = { ...other, quantity: 1 };

        expect(replaceItem([soft, LINE], 1, drink)).toEqual([{ ...drink, quantity: 2 }]);
        expect(replaceItem([drink, LINE], 1, soft)).toEqual([{ ...drink, quantity: 2 }]);
        expect(addItem([soft], drink)).toEqual([{ ...drink, quantity: 2 }]);
        expect(addItem([drink], soft)).toEqual([{ ...drink, quantity: 2 }]);
    });

    it('con una línea que no existe no cambia nada', () => {
        expect(replaceItem([LINE], 3, other)).toEqual([LINE]);
    });
});
