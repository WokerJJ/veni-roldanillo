import { describe, expect, it } from 'vitest';

import type { MenuDish } from '@/restaurants/profile';

import type { OrderItem } from './selection';
import { replaceItem, selectionFromItem, toOrderItem } from './selection';

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

    it('con una línea que no existe no cambia nada', () => {
        expect(replaceItem([LINE], 3, other)).toEqual([LINE]);
    });
});
