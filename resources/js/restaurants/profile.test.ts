import { describe, expect, it } from 'vitest';

import { profile } from '@/testing/restaurants';

import type { PaymentMethod, RestaurantProfile } from './profile';
import { hasContactInfo, knownPaymentMethods } from './profile';

/** Una ficha sin ningún dato de contacto. */
const bare = profile({ address: null, reference: null, phone: null, whatsapp: null, payment_methods: [], price_range: null });

describe('hay algo de «Ubicación y contacto» (EVA-035, BUG-037)', () => {
    it('sin ningún dato, no', () => {
        expect(hasContactInfo(bare)).toBe(false);
    });

    it.each<[string, Partial<RestaurantProfile>]>([
        ['address', { address: 'Calle de Prueba # 1-23' }],
        ['reference', { reference: 'Frente al parque' }],
        ['phone', { phone: '602 000 0000' }],
        ['whatsapp', { whatsapp: '570009998877' }],
        ['payment_methods', { payment_methods: ['cash'] }],
        ['price_range', { price_range: { min: 15_000, max: 15_000 } }],
    ])('con %s, sí', (_field, data) => {
        expect(hasContactInfo({ ...bare, ...data })).toBe(true);
    });

    it('un medio de pago que esta versión de la app no conoce no cuenta: no se muestra', () => {
        expect(knownPaymentMethods(['bitcoin' as PaymentMethod])).toEqual([]);
        expect(knownPaymentMethods(['bitcoin' as PaymentMethod, 'nequi'])).toEqual(['nequi']);
        expect(hasContactInfo({ ...bare, payment_methods: ['bitcoin' as PaymentMethod] })).toBe(false);
    });

    it('una página de antes de #127, sin price_range, no cuenta como dato', () => {
        const old: Partial<typeof bare> = { ...bare };
        delete old.price_range;

        expect(hasContactInfo(old as typeof bare)).toBe(false);
    });
});
