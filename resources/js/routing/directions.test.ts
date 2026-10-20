import { describe, expect, it } from 'vitest';

import { formatDistance, formatDuration, googleMapsUrl, wazeUrl } from './directions';

const LA_CEIBA: [number, number] = [-76.1547, 4.4128];

describe('enlaces a otras apps', () => {
    it('Google Maps: su enlace universal, sin clave, con el destino y cómo se va', () => {
        expect(googleMapsUrl(LA_CEIBA, 'foot')).toBe('https://www.google.com/maps/dir/?api=1&destination=4.4128%2C-76.1547&travelmode=walking');
        expect(googleMapsUrl(LA_CEIBA, 'car')).toBe('https://www.google.com/maps/dir/?api=1&destination=4.4128%2C-76.1547&travelmode=driving');
    });

    it('Waze: su enlace universal, con el destino', () => {
        expect(wazeUrl(LA_CEIBA)).toBe('https://waze.com/ul?ll=4.4128%2C-76.1547&navigate=yes');
    });

    it('ninguno lleva un origen: la ubicación de quien usa la app no va en el enlace', () => {
        for (const url of [googleMapsUrl(LA_CEIBA, 'foot'), googleMapsUrl(LA_CEIBA, 'car'), wazeUrl(LA_CEIBA)]) {
            const params = [...new URL(url).searchParams.keys()];

            expect(params).not.toContain('origin');
            expect(params).not.toContain('from');
            expect(params.length).toBeLessThanOrEqual(3);
        }
    });
});

describe('formatos', () => {
    it.each([
        [42, 'es', '40 m'],
        [3, 'es', '10 m'],
        [994, 'es', '990 m'],
        [1940, 'es', '1,9 km'],
        [1940, 'en', '1.9 km'],
        [12_000, 'es', '12 km'],
    ] as const)('distancia: %s m en %s es «%s»', (meters, locale, text) => {
        expect(formatDistance(meters, locale).replaceAll(' ', ' ')).toBe(text);
    });

    it.each([
        [20, 'es', '1 min'],
        [61, 'es', '2 min'],
        [3600, 'es', '1 h'],
        [3900, 'es', '1 h 5 min'],
        [3900, 'en', '1 hr 5 min'],
    ] as const)('duración: %s s en %s es «%s»', (seconds, locale, text) => {
        expect(formatDuration(seconds, locale).replaceAll(' ', ' ')).toBe(text);
    });
});
