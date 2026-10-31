import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderItem } from './selection';
import { CART_TTL_MS } from './storage';
import { resetOrders, useOrder } from './useOrder';

const juice: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4500, quantity: 1, choices: [{ group: 'Preparación', name: 'En leche', price: 500 }], removed: [], note: null };

afterEach(() => {
    resetOrders();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const HOUR_MS = 60 * 60 * 1000;

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

    it('si otra pestaña vacía todo el almacenamiento, el pedido abierto también se vacía', () => {
        const order = useOrder('la-ceiba');
        order.add(juice);

        window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));

        expect(order.items.value).toEqual([]);
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

    it('el carrito vence a las 24 h también en la memoria de la pestaña abierta', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-24T12:00:00-05:00'));
        useOrder('la-ceiba').add(juice);

        vi.setSystemTime(Date.now() + 25 * HOUR_MS);

        expect(useOrder('la-ceiba').items.value).toEqual([]);
        expect(localStorage.getItem('veni:cart:la-ceiba')).toBeNull();
    });

    it('vence también lo leído del dispositivo, contando desde que se guardó', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-24T12:00:00-05:00'));
        useOrder('la-ceiba').add(juice);

        // Otra pestaña lo lee 23 h después: le queda una hora, no 24 más.
        const saved = localStorage.getItem('veni:cart:la-ceiba') ?? '';
        resetOrders();
        localStorage.setItem('veni:cart:la-ceiba', saved);
        vi.setSystemTime(Date.now() + 23 * HOUR_MS);
        expect(useOrder('la-ceiba').items.value).toEqual([juice]);

        vi.setSystemTime(Date.now() + 2 * HOUR_MS);
        expect(useOrder('la-ceiba').items.value).toEqual([]);
    });

    it('al volver a la pestaña después de un día, el pedido ya vencido se vacía', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-24T12:00:00-05:00'));
        const order = useOrder('la-ceiba');
        order.add(juice);

        vi.setSystemTime(Date.now() + CART_TTL_MS - HOUR_MS);
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(order.items.value).toEqual([juice]);

        vi.setSystemTime(Date.now() + 2 * HOUR_MS);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(order.items.value).toEqual([]);
        expect(localStorage.getItem('veni:cart:la-ceiba')).toBeNull();
    });

    it('sigue lo que otra pestaña hace con el carrito del mismo restaurante', () => {
        const order = useOrder('la-ceiba');
        const other = useOrder('el-guadual');

        // La otra pestaña agrega: lo escribe en el dispositivo y avisa con `storage`.
        order.add(juice);
        const written = localStorage.getItem('veni:cart:la-ceiba');
        order.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:cart:la-ceiba', newValue: written }));
        expect(order.items.value).toEqual([juice]);

        // Lo dañado o vencido cuenta como vacío; lo que no es un carrito, no toca nada.
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:cart:la-ceiba', newValue: 'no es json' }));
        expect(order.items.value).toEqual([]);
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:cart:la-ceiba', newValue: written }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:delivery:la-ceiba', newValue: null }));
        expect(order.items.value).toEqual([juice]);

        // Un restaurante que esta pestaña no abrió no se carga por el aviso.
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:cart:otro', newValue: written }));
        expect(other.items.value).toEqual([]);

        // La otra pestaña vació el carrito.
        window.dispatchEvent(new StorageEvent('storage', { key: 'veni:cart:la-ceiba', newValue: null }));
        expect(order.items.value).toEqual([]);
    });
});
