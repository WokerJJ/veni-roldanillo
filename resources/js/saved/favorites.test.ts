import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAVORITES_KEY, MAX_FAVORITES, parseFavorites, resetFavorites, useFavorites } from './favorites';

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetFavorites();
});

describe('los favoritos', () => {
    it('se marcan y desmarcan, del último al primero, y se guardan solo con el slug', () => {
        const favorites = useFavorites();

        expect(favorites.toggle('la-ceiba')).toBe(true);
        expect(favorites.toggle('el-guadual')).toBe(true);
        expect(favorites.slugs.value).toEqual(['el-guadual', 'la-ceiba']);
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(JSON.stringify({ v: 1, data: ['el-guadual', 'la-ceiba'] }));

        expect(favorites.toggle('la-ceiba')).toBe(false);
        expect(favorites.has('la-ceiba')).toBe(false);

        resetFavorites();
        expect(useFavorites().slugs.value).toEqual(['el-guadual']);

        useFavorites().clear();
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
    });

    it('no pasa de 100 ni guarda lo que no es un slug', () => {
        const favorites = useFavorites();

        Array.from({ length: MAX_FAVORITES }, (_, index) => favorites.toggle(`r-${String(index)}`));

        expect(favorites.toggle('uno-mas')).toBe(false);
        expect(favorites.slugs.value).toHaveLength(MAX_FAVORITES);

        favorites.clear();
        expect(favorites.toggle('<script>')).toBe(false);
        expect(favorites.slugs.value).toEqual([]);
    });

    it('descarta lo que no tiene forma de favoritos', () => {
        expect(parseFavorites('no es json')).toEqual([]);
        expect(parseFavorites(JSON.stringify({ v: 2, data: ['la-ceiba'] }))).toEqual([]);
        expect(parseFavorites(JSON.stringify({ v: 1, data: 'la-ceiba' }))).toEqual([]);
        expect(parseFavorites('x'.repeat(12_001))).toEqual([]);
        expect(parseFavorites(JSON.stringify({ v: 1, data: ['la-ceiba', 7, 'La Ceiba', '../x', 'la-ceiba', 'el-guadual'] }))).toEqual(['la-ceiba', 'el-guadual']);
    });

    it('sigue lo que otra pestaña escribe', () => {
        const favorites = useFavorites();
        window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY, newValue: JSON.stringify({ v: 1, data: ['la-ceiba'] }) }));

        expect(favorites.slugs.value).toEqual(['la-ceiba']);
    });

    it('sin almacenamiento no falla', () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('Bloqueado', 'SecurityError');
        });

        expect(useFavorites().toggle('la-ceiba')).toBe(true);
    });
});
