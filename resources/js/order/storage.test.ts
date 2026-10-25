import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderItem } from './selection';
import {
    CART_PREFIX,
    CART_TTL_MS,
    DELIVERY_PREFIX,
    DELIVERY_TTL_MS,
    forgetDelivery,
    loadCart,
    loadDelivery,
    parseCart,
    parseDelivery,
    saveCart,
    saveDelivery,
} from './storage';

const NOW = Date.UTC(2026, 9, 22, 17);

const juice: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4500, quantity: 2, choices: [{ group: 'Preparación', name: 'En leche', price: 500 }], removed: ['hielo'], note: 'sin azúcar' };
const remembered = { mode: 'delivery' as const, neighborhood: 'El Carmen (ficticio)', address: 'Cra 5 #8-20', reference: 'casa azul', name: 'Ana' };

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

describe('el carrito en el dispositivo', () => {
    it('se guarda por restaurante y se lee igual', () => {
        saveCart('la-ceiba', [juice], NOW);

        expect(loadCart('la-ceiba', NOW + 1000)).toEqual([juice]);
        expect(loadCart('el-guadual', NOW)).toEqual([]);
    });

    it('vence a las 24 horas del último cambio, y entonces se borra', () => {
        saveCart('la-ceiba', [juice], NOW);

        expect(loadCart('la-ceiba', NOW + CART_TTL_MS)).toEqual([juice]);
        expect(loadCart('la-ceiba', NOW + CART_TTL_MS + 1)).toEqual([]);
        expect(window.localStorage.getItem(`${CART_PREFIX}la-ceiba`)).toBeNull();
    });

    it('vacío no deja nada guardado', () => {
        saveCart('la-ceiba', [juice], NOW);
        saveCart('la-ceiba', [], NOW);

        expect(window.localStorage.getItem(`${CART_PREFIX}la-ceiba`)).toBeNull();
    });

    it('descarta lo que no tiene forma de carrito (otra versión, tocado a mano o con fecha del futuro)', () => {
        const wrap = (data: unknown, savedAt = NOW) => JSON.stringify({ v: 1, savedAt, data });

        expect(parseCart('no es json', NOW)).toBeNull();
        expect(parseCart(JSON.stringify({ v: 2, savedAt: NOW, data: [juice] }), NOW)).toBeNull();
        expect(parseCart(wrap([juice], NOW + 60_000), NOW)).toBeNull();
        expect(parseCart(wrap([{ ...juice, unitPrice: -1 }]), NOW)).toBeNull();
        expect(parseCart(wrap([{ ...juice, unitPrice: 4500.5 }]), NOW)).toBeNull();
        expect(parseCart(wrap([{ ...juice, dish: 7 }]), NOW)).toBeNull();
        expect(parseCart(wrap([{ ...juice, choices: [{ name: 'x' }] }]), NOW)).toBeNull();
        expect(parseCart(wrap([{ ...juice, note: 'x'.repeat(141) }]), NOW)).toBeNull();
        expect(parseCart(wrap(Array.from({ length: 51 }, () => juice)), NOW)).toBeNull();
        expect(parseCart(wrap([]), NOW)).toBeNull();
    });

    it('deja la cantidad entre 1 y 20', () => {
        const raw = JSON.stringify({ v: 1, savedAt: NOW, data: [{ ...juice, quantity: 99 }] });

        expect(parseCart(raw, NOW)?.[0]?.quantity).toBe(20);
    });

    it('sin almacenamiento (privado o bloqueado) no falla: no recuerda', () => {
        // Así falla en Safari privado o con el almacenamiento bloqueado: al tocar localStorage.
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('Bloqueado', 'SecurityError');
        });

        expect(() => {
            saveCart('la-ceiba', [juice], NOW);
        }).not.toThrow();
        expect(loadCart('la-ceiba', NOW)).toEqual([]);
    });
});

describe('los datos de entrega en el dispositivo', () => {
    it('se guardan por restaurante, vencen a los 90 días y se borran a pedido', () => {
        saveDelivery('la-ceiba', remembered, NOW);

        expect(loadDelivery('la-ceiba', NOW + DELIVERY_TTL_MS)).toEqual(remembered);
        expect(loadDelivery('el-guadual', NOW)).toBeNull();
        expect(loadDelivery('la-ceiba', NOW + DELIVERY_TTL_MS + 1)).toBeNull();
        expect(window.localStorage.getItem(`${DELIVERY_PREFIX}la-ceiba`)).toBeNull();

        saveDelivery('la-ceiba', remembered, NOW);
        forgetDelivery('la-ceiba');

        expect(loadDelivery('la-ceiba', NOW)).toBeNull();
    });

    it('nunca guardan ubicación, medio de pago ni efectivo, aunque lleguen', () => {
        saveDelivery('la-ceiba', { ...remembered, location: { latitude: 4.41, longitude: -76.15 }, payment: 'cash', cashAmount: 50000 } as typeof remembered, NOW);

        expect(loadDelivery('la-ceiba', NOW)).toEqual(remembered);
    });

    it('descarta lo que no tiene forma de datos de entrega', () => {
        const wrap = (data: unknown) => JSON.stringify({ v: 1, savedAt: NOW, data });

        expect(parseDelivery(wrap({ ...remembered, mode: 'drone' }), NOW)).toBeNull();
        expect(parseDelivery(wrap({ ...remembered, address: 'x'.repeat(121) }), NOW)).toBeNull();
        expect(parseDelivery(wrap({ ...remembered, name: null }), NOW)).toBeNull();
    });
});
