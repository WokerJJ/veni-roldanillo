import { describe, expect, it } from 'vitest';

import type { TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';
import { translate } from '@/i18n/translate';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';
import type { OrderContext, OrderDetails } from './checkout';
import { emptyDetails } from './checkout';
import { locationUrl, orderMessage, whatsappNumber, whatsappUrl } from './message';
import type { OrderItem } from './selection';

const tEs = (key: TranslationKey, replacements?: Replacements): string => translate(es, key, replacements);
const tEn = (key: TranslationKey, replacements?: Replacements): string => translate(en, key, replacements);
/** Pesos sin Intl: el texto de la prueba no depende de la versión de ICU. */
const money = (amount: number): string => `$${String(amount)}`;

const burger: OrderItem = {
    dish: 'Hamburguesa de prueba',
    unitPrice: 24500,
    quantity: 2,
    choices: [
        { group: 'Adiciones', name: 'Queso', price: 2000 },
        { group: 'Adiciones', name: 'Tocineta', price: 2500 },
    ],
    removed: ['cebolla', 'tomate'],
    note: 'bien caliente',
};
const soda: OrderItem = { dish: 'Gaseosa 400 ml', unitPrice: 3000, quantity: 1, choices: [], removed: [], note: null };

const context: OrderContext = {
    deliveryAvailable: true,
    zones: [
        { neighborhood: 'El Carmen (ficticio)', fee: 3000 },
        { neighborhood: 'San Ensayo (ficticio)', fee: 2500 },
    ],
    paymentMethods: ['cash', 'nequi'],
};

const details: OrderDetails = {
    ...emptyDetails(context),
    neighborhood: 'El Carmen (ficticio)',
    address: '  Cra 5   #8-20 ',
    reference: 'casa azul\nfrente a la tienda',
    name: 'Ana',
    payment: 'cash',
    cashAmount: 100000,
};

describe('whatsappNumber', () => {
    it('deja el número de la ficha (57 y diez dígitos) y arregla espacios, + y el indicativo', () => {
        expect(whatsappNumber('570000722116')).toBe('570000722116');
        expect(whatsappNumber('+57 300 123 4567')).toBe('573001234567');
        expect(whatsappNumber('300 123-4567')).toBe('573001234567');
    });

    it('sin un número que sirva no hay WhatsApp', () => {
        expect(whatsappNumber(null)).toBeNull();
        expect(whatsappNumber('')).toBeNull();
        expect(whatsappNumber('229 1234')).toBeNull();
        expect(whatsappNumber('+1 555 123 4567 8')).toBeNull();
        expect(whatsappNumber('57300abc4567')).toBeNull();
    });
});

describe('whatsappUrl', () => {
    it('codifica el mensaje entero en ?text= (saltos, tildes, #, & y emojis)', () => {
        const url = whatsappUrl('573001234567', 'Hola & chao\nDirección: #8-20 📍');

        expect(url).toBe('https://wa.me/573001234567?text=Hola%20%26%20chao%0ADirecci%C3%B3n%3A%20%238-20%20%F0%9F%93%8D');
        expect(decodeURIComponent(new URL(url).searchParams.get('text') ?? '')).toBe('Hola & chao\nDirección: #8-20 📍');
    });
});

describe('locationUrl', () => {
    it('es un enlace universal de Google Maps, sin clave, con cinco decimales', () => {
        expect(locationUrl({ latitude: 4.412812345, longitude: -76.154712345 })).toBe('https://www.google.com/maps/search/?api=1&query=4.41281,-76.15471');
    });
});

describe('orderMessage', () => {
    it('arma el pedido a domicilio en español, en bloques legibles en WhatsApp', () => {
        expect(orderMessage([burger, soda], details, context, tEs, money)).toBe(
            [
                'Hola, quiero hacer un pedido desde Vení Roldanillo:',
                '• 2 × Hamburguesa de prueba + Queso + Tocineta, sin cebolla, tomate — $49000',
                '   Nota: bien caliente',
                '• 1 × Gaseosa 400 ml — $3000',
                '',
                'Platos: $52000',
                'Domicilio (El Carmen (ficticio)): $3000',
                'Total estimado: $55000',
                '',
                'Para domicilio',
                'Barrio: El Carmen (ficticio)',
                'Dirección: Cra 5 #8-20',
                'Referencia: casa azul frente a la tienda',
                'Nombre: Ana',
                'Pago: Efectivo, pago con $100000',
            ].join('\n'),
        );
    });

    it('en inglés, si la interfaz está en inglés', () => {
        const text = orderMessage([soda], { ...details, payment: 'nequi', cashAmount: null }, context, tEn, money);

        expect(text).toContain("Hi, I'd like to place an order from Vení Roldanillo:");
        expect(text).toContain('Estimated total: $6000');
        expect(text).toContain('Payment: Nequi');
        expect(text).not.toContain('paying with');
    });

    it('sin zonas, el domicilio queda por confirmar y el total dice «+ domicilio»', () => {
        const text = orderMessage([soda], { ...details, neighborhood: 'Barrio libre' }, { ...context, zones: [] }, tEs, money);

        expect(text).toContain('Domicilio: por confirmar');
        expect(text).toContain('Total estimado: $3000 + domicilio');
        expect(text).toContain('Barrio: Barrio libre');
    });

    it('al recoger en el local no lleva barrio, dirección, referencia, domicilio ni ubicación', () => {
        const text = orderMessage(
            [soda],
            { ...details, mode: 'pickup', location: { latitude: 4.41, longitude: -76.15, accuracy: 10 } },
            context,
            tEs,
            money,
        );

        expect(text).toBe(
            ['Hola, quiero hacer un pedido desde Vení Roldanillo:', '• 1 × Gaseosa 400 ml — $3000', '', 'Total estimado: $3000', '', 'Lo recojo en el local', 'Nombre: Ana', 'Pago: Efectivo, pago con $100000'].join('\n'),
        );
    });

    it('la ubicación va como enlace solo si la persona la agregó', () => {
        expect(orderMessage([soda], details, context, tEs, money)).not.toContain('📍');

        const text = orderMessage([soda], { ...details, location: { latitude: 4.4128, longitude: -76.1547, accuracy: 12 } }, context, tEs, money);

        expect(text.split('\n').at(-1)).toBe('📍 Ubicación: https://www.google.com/maps/search/?api=1&query=4.41280,-76.15470');
    });

    it('lo opcional vacío no deja rótulos sueltos', () => {
        const text = orderMessage([soda], { ...details, reference: '   ', name: '', payment: null, cashAmount: null }, context, tEs, money);

        expect(text).not.toContain('Referencia:');
        expect(text).not.toContain('Nombre:');
        expect(text).not.toContain('Pago:');
    });

    it('con los mismos datos el texto es siempre el mismo', () => {
        expect(orderMessage([burger], details, context, tEs, money)).toBe(orderMessage([burger], details, context, tEs, money));
    });
});
