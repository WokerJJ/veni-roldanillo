import { describe, expect, it } from 'vitest';

import { mapUrl, restaurantUrl, selectedFromUrl } from './links';

describe('restaurantUrl', () => {
    it('la ficha de un restaurante está en /restaurants/{slug}', () => {
        expect(restaurantUrl('prueba-la-ceiba')).toBe('/restaurants/prueba-la-ceiba');
    });

    it('un slug que llegara con otra forma no cambia de ruta ni suma parámetros', () => {
        expect(restaurantUrl('a/b?c=d#e')).toBe('/restaurants/a%2Fb%3Fc%3Dd%23e');
    });
});

describe('mapUrl', () => {
    it('el mapa del inicio con un restaurante elegido es /?r={slug}', () => {
        expect(mapUrl('prueba-la-ceiba')).toBe('/?r=prueba-la-ceiba');
    });

    it('solo lleva el restaurante: nada de coordenadas ni de quien lo pide', () => {
        expect([...new URLSearchParams(mapUrl('prueba-la-ceiba').slice(2)).keys()]).toEqual(['r']);
    });

    it('un slug que llegara con otra forma no suma parámetros', () => {
        expect(mapUrl('a&lat=4.41')).toBe('/?r=a%26lat%3D4.41');
        expect(selectedFromUrl(mapUrl('a&lat=4.41'))).toBe('a&lat=4.41');
    });
});

describe('selectedFromUrl', () => {
    it('lee el restaurante de la dirección que arma mapUrl', () => {
        expect(selectedFromUrl(mapUrl('prueba-la-ceiba'))).toBe('prueba-la-ceiba');
    });

    it.each([
        ['/?r=prueba-la-ceiba', 'prueba-la-ceiba'],
        ['/?lang=en&r=prueba-la-ceiba', 'prueba-la-ceiba'],
        ['/?r=prueba-la-ceiba#contenido', 'prueba-la-ceiba'],
        ['http://localhost:8000/?r=prueba-la-ceiba', 'prueba-la-ceiba'],
    ])('en «%s» el elegido es «%s»', (url, slug) => {
        expect(selectedFromUrl(url)).toBe(slug);
    });

    it.each(['/', '/?lang=en', '/?r=', '/?radio=1', '', '/#r=prueba-la-ceiba'])('en «%s» no hay ninguno elegido', (url) => {
        expect(selectedFromUrl(url)).toBeNull();
    });
});
