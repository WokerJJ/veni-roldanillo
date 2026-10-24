import { afterEach, describe, expect, it } from 'vitest';

import type { OrderItem } from './selection';
import { resetOrders, useOrder } from './useOrder';

const juice: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4500, quantity: 1, choices: [{ group: 'Preparación', name: 'En leche', price: 500 }], removed: [], note: null };

afterEach(() => {
    resetOrders();
});

describe('useOrder', () => {
    it('empieza vacío', () => {
        const order = useOrder('la-ceiba');

        expect(order.items.value).toEqual([]);
        expect(order.count.value).toBe(0);
        expect(order.total.value).toBe(0);
    });

    it('agrega, junta líneas iguales y calcula el total', () => {
        const order = useOrder('la-ceiba');

        order.add(juice);
        order.add({ ...juice, quantity: 2 });

        expect(order.items.value).toHaveLength(1);
        expect(order.count.value).toBe(3);
        expect(order.total.value).toBe(13500);
    });

    it('al juntar líneas no pasa de 20 unidades y dice cuántas entraron', () => {
        const order = useOrder('la-ceiba');

        expect(order.add({ ...juice, quantity: 15 })).toBe(15);
        expect(order.add({ ...juice, quantity: 10 })).toBe(5);
        expect(order.add(juice)).toBe(0);

        expect(order.count.value).toBe(20);
    });

    it('cada restaurante tiene su pedido, y lo comparten quienes lo usan', () => {
        useOrder('la-ceiba').add(juice);

        expect(useOrder('el-guadual').count.value).toBe(0);
        expect(useOrder('la-ceiba').count.value).toBe(1);
    });

    it('vaciar deja el pedido en cero', () => {
        const order = useOrder('la-ceiba');

        order.add(juice);
        order.clear();

        expect(order.items.value).toEqual([]);
    });

    it('guarda el carrito en el dispositivo y lo recupera al recargar (ADR 0024)', () => {
        useOrder('la-ceiba').add(juice);

        expect(localStorage.getItem('veni:cart:la-ceiba')).toContain('Jugo de prueba');
        expect(sessionStorage.length).toBe(0);

        // Recargar: la memoria se pierde, el dispositivo no.
        const saved = localStorage.getItem('veni:cart:la-ceiba') ?? '';
        resetOrders();
        localStorage.setItem('veni:cart:la-ceiba', saved);

        expect(useOrder('la-ceiba').items.value).toEqual([juice]);
    });

    it('cambia la cantidad (entre 1 y 20), quita líneas y vacía, y lo guarda', () => {
        const order = useOrder('la-ceiba');
        order.add(juice);
        order.add({ ...juice, choices: [], unitPrice: 4000 });

        order.setQuantity(0, 50);
        expect(order.items.value[0]?.quantity).toBe(20);
        order.setQuantity(0, 0);
        expect(order.items.value[0]?.quantity).toBe(1);

        order.remove(0);
        expect(order.items.value).toEqual([{ ...juice, choices: [], unitPrice: 4000 }]);

        order.clear();
        expect(order.count.value).toBe(0);
        expect(localStorage.getItem('veni:cart:la-ceiba')).toBeNull();
    });
});
