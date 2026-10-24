import { describe, expect, it } from 'vitest';

import type { OrderContext, OrderDetails } from './checkout';
import { cleanText, deliveryFee, detailsProblems, emptyDetails, estimatedTotal, parseCash } from './checkout';
import type { OrderItem } from './selection';

const soup: OrderItem = { dish: 'Sancocho de prueba', unitPrice: 18500, quantity: 2, choices: [], removed: [], note: null };

const context: OrderContext = {
    deliveryAvailable: true,
    zones: [{ neighborhood: 'El Carmen (ficticio)', fee: 3000 }],
    paymentMethods: ['cash', 'nequi'],
};

function details(patch: Partial<OrderDetails> = {}): OrderDetails {
    return { ...emptyDetails(context), ...patch };
}

describe('emptyDetails', () => {
    it('empieza a domicilio si el restaurante lo hace; si no, a recoger', () => {
        expect(emptyDetails(context).mode).toBe('delivery');
        expect(emptyDetails({ ...context, deliveryAvailable: false }).mode).toBe('pickup');
    });

    it('elige el medio de pago solo si hay uno', () => {
        expect(emptyDetails(context).payment).toBeNull();
        expect(emptyDetails({ ...context, paymentMethods: ['nequi'] }).payment).toBe('nequi');
    });

    it('nunca empieza con ubicación', () => {
        expect(emptyDetails(context).location).toBeNull();
    });
});

describe('deliveryFee y estimatedTotal', () => {
    it('suma el domicilio del barrio elegido', () => {
        expect(estimatedTotal([soup], details({ neighborhood: 'El Carmen (ficticio)' }), context)).toEqual({ items: 37000, fee: 3000, total: 40000 });
    });

    it('sin barrio, o sin zonas publicadas, el domicilio queda por confirmar (null)', () => {
        expect(deliveryFee(details(), context)).toBeNull();
        expect(deliveryFee(details({ neighborhood: 'Otro barrio' }), { ...context, zones: [] })).toBeNull();
        expect(estimatedTotal([soup], details(), context)).toEqual({ items: 37000, fee: null, total: 37000 });
    });

    it('al recoger, o si el restaurante no hace domicilios, no hay domicilio', () => {
        expect(deliveryFee(details({ mode: 'pickup', neighborhood: 'El Carmen (ficticio)' }), context)).toBe(0);
        expect(deliveryFee(details({ neighborhood: 'El Carmen (ficticio)' }), { ...context, deliveryAvailable: false })).toBe(0);
    });
});

describe('parseCash', () => {
    it('acepta pesos enteros como se escriben', () => {
        expect(parseCash('50000')).toBe(50000);
        expect(parseCash('50.000')).toBe(50000);
        expect(parseCash(' $ 100 000 ')).toBe(100000);
    });

    it('lo que no es un valor en pesos es null', () => {
        expect(parseCash('')).toBeNull();
        expect(parseCash('cincuenta')).toBeNull();
        expect(parseCash('50,5')).toBeNull();
        expect(parseCash('0')).toBeNull();
        expect(parseCash('-2000')).toBeNull();
        expect(parseCash('20000000')).toBeNull();
    });

    it('acepta coma, punto o espacio como separador de miles y el prefijo COP o $', () => {
        expect(parseCash('50,000')).toBe(50000);
        expect(parseCash('COP 50,000')).toBe(50000);
        expect(parseCash('cop50.000')).toBe(50000);
        expect(parseCash('$ 50.000')).toBe(50000);
        expect(parseCash('1.000.000')).toBe(1000000);
    });

    it('un separador que no agrupa de a tres es un decimal: null, no un valor cien veces menor', () => {
        expect(parseCash('50.5')).toBeNull();
        expect(parseCash('1.5')).toBeNull();
        expect(parseCash('5,00')).toBeNull();
        expect(parseCash('50.000,00')).toBeNull();
        expect(parseCash('50..000')).toBeNull();
        expect(parseCash('.500')).toBeNull();
    });
});

describe('cleanText', () => {
    it('deja una línea sin espacios de más, recortada', () => {
        expect(cleanText('  casa azul\n\nfrente   a la tienda ', 120)).toBe('casa azul frente a la tienda');
        expect(cleanText('abcdef', 3)).toBe('abc');
    });
});

describe('detailsProblems', () => {
    it('a domicilio pide barrio de la lista, dirección y medio de pago', () => {
        expect(detailsProblems([soup], details({ neighborhood: 'Barrio inventado' }), context)).toEqual([
            { field: 'neighborhood', kind: 'missing' },
            { field: 'address', kind: 'missing' },
            { field: 'payment', kind: 'missing' },
        ]);
    });

    it('sin zonas, el barrio se escribe a mano y basta con que no esté vacío', () => {
        const open = { ...context, zones: [] };

        expect(detailsProblems([soup], details({ neighborhood: '  ', address: 'Cra 5', payment: 'nequi' }), open)).toEqual([{ field: 'neighborhood', kind: 'missing' }]);
        expect(detailsProblems([soup], details({ neighborhood: 'Centro', address: 'Cra 5', payment: 'nequi' }), open)).toEqual([]);
    });

    it('al recoger solo pide el medio de pago', () => {
        expect(detailsProblems([soup], details({ mode: 'pickup' }), context)).toEqual([{ field: 'payment', kind: 'missing' }]);
        expect(detailsProblems([soup], details({ mode: 'pickup', payment: 'cash' }), context)).toEqual([]);
    });

    it('un medio que el restaurante no acepta no vale', () => {
        expect(detailsProblems([soup], details({ mode: 'pickup', payment: 'card' }), context)).toEqual([{ field: 'payment', kind: 'missing' }]);
    });

    it('si el restaurante no publicó medios de pago, no se pide', () => {
        expect(detailsProblems([soup], details({ mode: 'pickup' }), { ...context, paymentMethods: [] })).toEqual([]);
    });

    it('«¿con cuánto pagás?» es opcional, pero tiene que alcanzar para el total que se conoce', () => {
        const ready = details({ neighborhood: 'El Carmen (ficticio)', address: 'Cra 5', payment: 'cash' });

        expect(detailsProblems([soup], ready, context)).toEqual([]);
        expect(detailsProblems([soup], { ...ready, cashAmount: 40000 }, context)).toEqual([]);
        expect(detailsProblems([soup], { ...ready, cashAmount: 39000 }, context)).toEqual([{ field: 'cash', kind: 'short', total: 40000 }]);
        // Con el domicilio por confirmar solo se compara con los platos.
        expect(detailsProblems([soup], { ...ready, cashAmount: 37000 }, { ...context, zones: [] })).toEqual([]);
    });
});
