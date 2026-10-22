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

    it('no guarda nada en el dispositivo', () => {
        useOrder('la-ceiba').add(juice);

        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
    });
});
