import { describe, expect, it } from 'vitest';

import { restaurantUrl } from './links';

describe('restaurantUrl', () => {
    it('la ficha de un restaurante está en /restaurants/{slug}', () => {
        expect(restaurantUrl('prueba-la-ceiba')).toBe('/restaurants/prueba-la-ceiba');
    });

    it('un slug que llegara con otra forma no cambia de ruta ni suma parámetros', () => {
        expect(restaurantUrl('a/b?c=d#e')).toBe('/restaurants/a%2Fb%3Fc%3Dd%23e');
    });
});
