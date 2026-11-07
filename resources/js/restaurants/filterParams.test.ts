import { describe, expect, it } from 'vitest';

import { filtersFromUrl, hasFilters, MAX_QUERY_LENGTH, NO_FILTERS, sameAddress, writeFilters } from './filterParams';
import { hasListParams } from './listParams';

function written(filters: Parameters<typeof writeFilters>[1], start = ''): string {
    const params = new URLSearchParams(start);

    writeFilters(params, filters);

    return params.toString();
}

describe('filtersFromUrl', () => {
    it('sin parámetros no hay filtros', () => {
        expect(filtersFromUrl('/')).toEqual(NO_FILTERS);
        expect(filtersFromUrl('/?r=prueba-la-ceiba')).toEqual(NO_FILTERS);
    });

    it('lee cada filtro de su parámetro', () => {
        expect(filtersFromUrl('/?q=Fog%C3%B3n&open=1&delivery=1&price=25000&category=comida-tipica&r=x#mapa')).toEqual({
            query: 'Fogón',
            open: true,
            delivery: true,
            price: 25_000,
            category: 'comida-tipica',
        });
    });

    it('lo que no se entiende se ignora', () => {
        expect(filtersFromUrl('/?open=si&delivery=true&price=9&category=<script>')).toEqual(NO_FILTERS);
        expect(filtersFromUrl('/?price=1.5').price).toBeNull();
        // Solo los topes que ofrece el selector: otro número es un enlace armado a mano.
        expect(filtersFromUrl('/?price=20000').price).toBeNull();
        expect(filtersFromUrl('/?price=-15000').price).toBeNull();
        // Un enlace de antes de #127, con el nivel 1–4 (ADR 0039): se ignora, no se traduce.
        expect(filtersFromUrl('/?price=2').price).toBeNull();
        expect(filtersFromUrl(`/?q=${'a'.repeat(200)}`).query).toHaveLength(MAX_QUERY_LENGTH);
    });
});

describe('writeFilters', () => {
    it('escribe solo los filtros puestos y deja los demás parámetros', () => {
        expect(written({ ...NO_FILTERS, open: true, price: 40_000 }, 'r=prueba-la-ceiba')).toBe('r=prueba-la-ceiba&open=1&price=40000');
    });

    it('quita los que se sacaron, y el buscador con solo espacios', () => {
        expect(written({ ...NO_FILTERS, query: '   ' }, 'q=ceiba&open=1&delivery=1&price=25000&category=asados')).toBe('');
    });

    it('ida y vuelta: lo que se escribe se lee igual', () => {
        const filters = { query: 'comida típica', open: true, delivery: false, price: 15_000, category: 'asados' };

        expect(filtersFromUrl(`/?${written(filters)}`)).toEqual(filters);
    });
});

describe('hasFilters', () => {
    it('cualquier filtro cuenta, menos el buscador vacío', () => {
        expect(hasFilters(NO_FILTERS)).toBe(false);
        expect(hasFilters({ ...NO_FILTERS, query: '  ' })).toBe(false);
        expect(hasFilters({ ...NO_FILTERS, query: 'x' })).toBe(true);
        expect(hasFilters({ ...NO_FILTERS, category: 'asados' })).toBe(true);
        expect(hasFilters({ ...NO_FILTERS, price: 15_000 })).toBe(true);
    });
});

describe('sameAddress', () => {
    it('compara los parámetros normalizados, no el texto', () => {
        expect(sameAddress('/?q=la%20ceiba', '/?q=la+ceiba')).toBe(true);
        expect(sameAddress('/?open=1&q=x', '/?q=x&open=1')).toBe(true);
        expect(sameAddress('/?q=la%20ceiba', '/?q=la+ceiba&open=1')).toBe(false);
        expect(sameAddress('/', '/?r=prueba-la-ceiba')).toBe(false);
    });
});

describe('la mirada rápida del arranque a la dirección (listParams.ts, #138)', () => {
    // El inicio abre la lista con siluetas si la dirección trae filtros, sin
    // bajar este módulo: su lectura tiene que decir lo mismo que la de verdad.
    it.each([
        '/',
        '/?r=prueba-la-ceiba',
        '/?q=sancocho',
        '/?r=prueba-la-ceiba&q=sopa',
        '/?q=',
        '/?q=+',
        '/?q=%20%09',
        '/?q=&q=sancocho',
        '/?q=sancocho&q=',
        `/?q=${'%20'.repeat(MAX_QUERY_LENGTH)}x`,
        '/?q=x#ancla',
        '/#ancla?q=x',
        '/?open=1',
        '/?open=10',
        '/?open=true',
        '/?open=%31',
        '/?delivery=1',
        '/?delivery=0',
        '/?price=2',
        '/?price=15000',
        '/?price=25000',
        '/?price=40000',
        '/?price=015000',
        '/?price=+40000',
        '/?price=2.5e4',
        '/?price=',
        '/?category=comida-tipica',
        '/?category=Mala_Categoria',
        '/?category=a--b',
        '/?category=',
        `/?category=${'a'.repeat(101)}`,
        `/?category=${'a'.repeat(100)}`,
    ])('%s: abre la lista solo si los filtros que lee la lista la abrirían', (url) => {
        expect(hasListParams(url)).toBe(hasFilters(filtersFromUrl(url)));
    });
});
