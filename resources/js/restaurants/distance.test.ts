import { describe, expect, it } from 'vitest';

import { distancesFrom, metersBetween } from './distance';

// El parque de Roldanillo y La Ceiba de prueba, a unos 300 m.
const PARQUE: [number, number] = [-76.1565, 4.4105];

describe('distancias en el dispositivo', () => {
    it('mide en línea recta, en metros', () => {
        // Un grado de latitud son unos 111,2 km.
        expect(metersBetween([-76.15, 4], [-76.15, 5])).toBeCloseTo(111_195, -1);
        expect(metersBetween(PARQUE, PARQUE)).toBe(0);
        expect(metersBetween(PARQUE, [-76.1547, 4.4128])).toBeCloseTo(325, -1);
    });

    it('da los metros hasta cada restaurante por slug, redondeados a 10: no la ubicación de donde salieron', () => {
        expect(
            distancesFrom(PARQUE, [
                { slug: 'prueba-la-ceiba', coordinates: [-76.1547, 4.4128] },
                { slug: 'aqui', coordinates: PARQUE },
            ]),
        ).toEqual({ 'prueba-la-ceiba': 320, aqui: 0 });
    });
});
