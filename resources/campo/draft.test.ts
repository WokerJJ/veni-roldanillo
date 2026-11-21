import { describe, expect, it } from 'vitest';

import type { Draft } from './draft';
import { draftFromReturned, firstInvalidStep, hoursAreValid, newDraft, normalizeMobile, publishedDuplicates, STEPS, toBody, validateStep } from './draft';

function complete(overrides: Partial<Draft> = {}): Draft {
    return {
        ...newDraft('11111111-1111-4111-8111-111111111111', new Date('2026-11-18T15:00:00Z')),
        name: 'Sazón del Parque',
        categoryIds: [3, 1],
        address: 'Carrera 8 # 10-20',
        reference: ' junto a la iglesia ',
        latitude: 4.412,
        longitude: -76.154,
        accuracy: 12,
        locationSource: 'device',
        whatsapp: '300 111 2233',
        phone: '(602) 123-4567',
        delivery: true,
        paymentMethods: ['cash'],
        hours: [{ weekday: 1, opens: '11:00', closes: '15:00' }],
        ownerName: 'Marta Ríos',
        ownerPhone: '+57 300-444-5566',
        purposeExplained: true,
        duplicates: [],
        ...overrides,
    };
}

describe('normalizeMobile', () => {
    it('lleva los celulares colombianos a 57 + diez dígitos, como el servidor', () => {
        expect(normalizeMobile('300 123 4567')).toBe('573001234567');
        expect(normalizeMobile('+57 300-123-4567')).toBe('573001234567');
        expect(normalizeMobile('(57) 300.123.4567')).toBe('573001234567');
    });

    it('rechaza lo que no es un celular', () => {
        expect(normalizeMobile('6021234567')).toBeNull();
        expect(normalizeMobile('12345')).toBeNull();
        expect(normalizeMobile('')).toBeNull();
    });
});

describe('hoursAreValid', () => {
    const slot = (weekday: number, opens: string, closes: string) => ({ weekday, opens, closes });

    it('acepta franjas que se tocan pero no se cruzan, y la que pasa la medianoche', () => {
        expect(hoursAreValid([slot(1, '11:00', '15:00'), slot(1, '15:00', '18:00'), slot(1, '19:00', '02:00')])).toBe(true);
        expect(hoursAreValid([])).toBe(true);
    });

    it('rechaza franjas que se cruzan, abrir y cerrar a la misma hora y horas mal escritas', () => {
        expect(hoursAreValid([slot(2, '10:00', '14:00'), slot(2, '13:00', '16:00')])).toBe(false);
        expect(hoursAreValid([slot(2, '10:00', '10:00')])).toBe(false);
        expect(hoursAreValid([slot(2, '25:00', '10:00')])).toBe(false);
        expect(hoursAreValid([slot(2, '18:00', '02:00'), slot(2, '23:00', '03:00')])).toBe(false);
    });

    it('la semana es circular: la noche que pasa la medianoche no pisa la madrugada del día siguiente', () => {
        expect(hoursAreValid([slot(1, '22:00', '02:00'), slot(2, '01:00', '03:00')])).toBe(false);
        expect(hoursAreValid([slot(6, '22:00', '02:00'), slot(0, '01:00', '03:00')])).toBe(false);
        expect(hoursAreValid([slot(0, '01:00', '03:00'), slot(6, '22:00', '02:00')])).toBe(false);
        expect(hoursAreValid([slot(1, '22:00', '02:00'), slot(2, '02:00', '04:00')])).toBe(true);
        expect(hoursAreValid([slot(6, '22:00', '02:00'), slot(0, '02:00', '04:00')])).toBe(true);
        expect(hoursAreValid([slot(0, '10:00', '14:00'), slot(6, '10:00', '23:00')])).toBe(true);
    });
});

describe('validateStep', () => {
    it('pide nombre y al menos una categoría', () => {
        expect(validateStep(newDraft('x'), 'basics')).toEqual({ name: 'required', categories: 'categories' });
        expect(validateStep(complete({ name: 'A' }), 'basics')).toEqual({ name: 'too_short' });
        expect(validateStep(complete(), 'basics')).toEqual({});
    });

    it('pide dirección y el punto, y que caiga cerca de Roldanillo', () => {
        expect(validateStep(newDraft('x'), 'place')).toEqual({ address: 'required', location: 'location' });
        expect(validateStep(complete({ latitude: 40.4, longitude: -3.7 }), 'place')).toEqual({ location: 'invalid' });
        expect(validateStep(complete(), 'place')).toEqual({});
    });

    it('con el contacto, el celular del negocio y el fijo se revisan solo si se escriben; el domicilio es obligatorio', () => {
        expect(validateStep(complete({ whatsapp: '', phone: '' }), 'contact')).toEqual({});
        expect(validateStep(complete({ whatsapp: '12345' }), 'contact')).toEqual({ whatsapp: 'whatsapp' });
        expect(validateStep(complete({ phone: 'abc' }), 'contact')).toEqual({ phone: 'phone' });
        expect(validateStep(complete({ delivery: null }), 'contact')).toEqual({ delivery: 'required' });
    });

    it('del dueño pide nombre, celular colombiano y que se le explicó el uso de sus datos', () => {
        expect(validateStep(newDraft('x'), 'owner')).toEqual({ ownerName: 'required', ownerPhone: 'whatsapp', purpose: 'purpose' });
        expect(validateStep(complete({ ownerPhone: '6021234567' }), 'owner')).toEqual({ ownerPhone: 'whatsapp' });
        expect(validateStep(complete(), 'owner')).toEqual({});
    });

    it('una ficha publicada parecida bloquea los duplicados hasta marcarla como otro negocio', () => {
        const published = { kind: 'restaurant', id: 9, restaurant_id: 9, name: 'Sazón', status: 'unclaimed', distance_m: 10, similarity: 0.9, from_osm: false } as const;
        const hidden = { ...published, id: 10, restaurant_id: 10, status: 'hidden', from_osm: true } as const;

        expect(publishedDuplicates(complete({ duplicates: [published, hidden] })).map((c) => c.id)).toEqual([9]);
        expect(validateStep(complete({ duplicates: [published] }), 'duplicates')).toEqual({ duplicates: 'invalid' });
        expect(validateStep(complete({ duplicates: [published], distinctFrom: [9] }), 'duplicates')).toEqual({});
        expect(validateStep(complete({ duplicates: [hidden] }), 'duplicates')).toEqual({});
        expect(validateStep(complete({ duplicates: null }), 'duplicates')).toEqual({});
    });
});

describe('firstInvalidStep', () => {
    it('devuelve el primer paso con errores, y null con la ficha completa', () => {
        expect(firstInvalidStep(newDraft('x'))).toBe('basics');
        expect(firstInvalidStep(complete({ ownerName: '' }))).toBe('owner');
        expect(firstInvalidStep(complete())).toBeNull();
    });
});

describe('toBody', () => {
    it('arma el cuerpo del servidor: celulares normalizados, textos recortados y vacíos como null', () => {
        const body = toBody(complete({ phone: '', reference: '  ' }));

        expect(body).toMatchObject({
            name: 'Sazón del Parque',
            whatsapp: '573001112233',
            phone: null,
            reference: null,
            owner_phone: '573004445566',
            owner_role: 'owner',
            latitude: 4.412,
            longitude: -76.154,
            location_source: 'device',
            captured_at: '2026-11-18T15:00:00.000Z',
            restaurant_id: null,
            distinct_from: [],
        });
    });

    it('el fijo va sin separadores', () => {
        expect(toBody(complete()).phone).toBe('6021234567');
    });

    it('un borrador incompleto no se manda: lanza', () => {
        expect(() => toBody(newDraft('x'))).toThrow('no está completo');
    });

    it('no lleva nada de la precisión del GPS ni del estado local', () => {
        const body = toBody(complete());

        expect(Object.keys(body)).not.toContain('accuracy');
        expect(Object.keys(body)).not.toContain('state');
    });
});

describe('draftFromReturned', () => {
    it('vuelve el contenido devuelto a un borrador listo para corregir, con la nota', () => {
        const body = toBody(complete());
        const { captured_at: capturedAt, ...content } = body;
        expect(capturedAt).toBe('2026-11-18T15:00:00.000Z');
        const draft = draftFromReturned('22222222-2222-4222-8222-222222222222', content, 'Falta la referencia', new Date('2026-11-19T10:00:00Z'));

        expect(draft).toMatchObject({ uuid: '22222222-2222-4222-8222-222222222222', name: 'Sazón del Parque', returnNote: 'Falta la referencia', ownerPhone: '573004445566', purposeExplained: true });
        expect(firstInvalidStep(draft)).toBeNull();
        expect(draft.step).toBe(STEPS.indexOf('review'));
    });
});
