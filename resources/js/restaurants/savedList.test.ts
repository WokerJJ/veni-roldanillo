import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EL_GUADUAL, LA_CEIBA } from '@/testing/restaurants';
import { quotaExceeded, spyStorage } from '@/testing/storage';

import { agoText, loadSaved, savedIn, MAX_AGE_MS, SAVED_KEY, saveList } from './savedList';

const NOW = new Date('2026-10-07T12:00:00-05:00').getTime();

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('la lista guardada (#144)', () => {
    it('lo que se guarda se lee igual, con su hora y su idioma', () => {
        expect(saveList('es', [LA_CEIBA, EL_GUADUAL], NOW - 5_000)).toBe(true);

        expect(loadSaved(NOW)).toEqual({ savedAt: NOW - 5_000, locale: 'es', restaurants: [LA_CEIBA, EL_GUADUAL] });
    });

    it('una lista nueva reemplaza a la anterior, y una vacía la borra', () => {
        saveList('es', [LA_CEIBA], NOW);
        saveList('en', [EL_GUADUAL], NOW);

        expect(loadSaved(NOW)?.restaurants).toEqual([EL_GUADUAL]);

        expect(saveList('en', [], NOW)).toBe(true);
        expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
        expect(loadSaved(NOW)).toBeNull();
    });

    it('pasados 14 días ya no se usa, y una hora del futuro tampoco', () => {
        saveList('es', [LA_CEIBA], NOW - MAX_AGE_MS);
        expect(loadSaved(NOW)).not.toBeNull();

        saveList('es', [LA_CEIBA], NOW - MAX_AGE_MS - 1);
        expect(loadSaved(NOW)).toBeNull();

        saveList('es', [LA_CEIBA], NOW + 1);
        expect(loadSaved(NOW)).toBeNull();
    });

    it.each([
        ['no es JSON', 'esto no es json'],
        ['es de otra versión', JSON.stringify({ version: 2, savedAt: NOW, locale: 'es', restaurants: [LA_CEIBA] })],
        ['tiene un idioma que la app no tiene', JSON.stringify({ version: 1, savedAt: NOW, locale: 'pt', restaurants: [LA_CEIBA] })],
        ['no trae lista', JSON.stringify({ version: 1, savedAt: NOW, locale: 'es' })],
        ['no tiene ningún restaurante con la forma', JSON.stringify({ version: 1, savedAt: NOW, locale: 'es', restaurants: [{ slug: 'x' }, null, 4] })],
    ])('lo guardado que %s se descarta', (_case, raw) => {
        window.localStorage.setItem(SAVED_KEY, raw);

        expect(loadSaved(NOW)).toBeNull();
    });

    it('un restaurante roto se salta; los demás se muestran', () => {
        window.localStorage.setItem(
            SAVED_KEY,
            JSON.stringify({ version: 1, savedAt: NOW, locale: 'es', restaurants: [{ slug: 'x', name: 'X', coordinates: ['a', 1], categories: [], hours: [], special_hours: [] }, LA_CEIBA] }),
        );

        expect(loadSaved(NOW)?.restaurants).toEqual([LA_CEIBA]);
    });

    it('una copia completa y válida (con almuerzo, precios, horario especial) sigue pasando', () => {
        const full = {
            ...LA_CEIBA,
            categories: [{ slug: 'parrilla', name: 'Parrilla' }],
            hours: [{ weekday: 6, opens: '11:00', closes: '22:00' }],
            special_hours: [
                { date: '2026-12-25', closed: true, opens: null, closes: null },
                { date: '2026-12-31', closed: false, opens: '10:00', closes: '14:00' },
            ],
            delivery: true,
            fictitious: false,
            lunch: { date: '2026-10-07', description: 'Sancocho', price: 15_000 },
            price_range: { min: 9_000, max: 32_000 },
        };
        window.localStorage.setItem(SAVED_KEY, JSON.stringify({ version: 1, savedAt: NOW, locale: 'es', restaurants: [full] }));

        expect(loadSaved(NOW)?.restaurants).toEqual([full]);
    });

    it.each([
        ['una categoría que no es objeto', { categories: [1] }],
        ['una categoría sin nombre', { categories: [{ slug: 'x' }] }],
        ['un horario vacío', { hours: [{}] }],
        ['un día de la semana fuera de 0 a 6', { hours: [{ weekday: 7, opens: '08:00', closes: '12:00' }] }],
        ['una hora que no es texto', { hours: [{ weekday: 1, opens: 800, closes: '12:00' }] }],
        ['un horario especial vacío', { special_hours: [{}] }],
        ['un horario especial sin «closed» booleano', { special_hours: [{ date: '2026-12-25', closed: 'si', opens: null, closes: null }] }],
        ['un horario especial con una hora que no es texto ni null', { special_hours: [{ date: '2026-12-25', closed: false, opens: 9, closes: null }] }],
        ['un almuerzo que es texto', { lunch: 'x' }],
        ['un almuerzo sin precio numérico', { lunch: { date: '2026-10-07', description: 'Sancocho', price: '15' } }],
        ['un rango de precios con texto', { price_range: { min: 'a', max: 2 } }],
        ['un rango de precios con mínimo mayor que el máximo', { price_range: { min: 10, max: 2 } }],
        ['un rango de precios que es un número', { price_range: 5 }],
        ['un domicilio que no es booleano', { delivery: 'yes' }],
        ['una marca de ejemplo que no es booleana', { fictitious: 1 }],
        ['una longitud fuera de rango', { coordinates: [181, 4.4] }],
        ['una latitud fuera de rango', { coordinates: [-76.1, 91] }],
    ])('un restaurante con %s se descarta, y los demás se muestran', (_case, broken) => {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify({ version: 1, savedAt: NOW, locale: 'es', restaurants: [{ ...LA_CEIBA, ...broken }, EL_GUADUAL] }));

        expect(loadSaved(NOW)?.restaurants).toEqual([EL_GUADUAL]);
    });

    it('una lista demasiado grande no se guarda, y borra la anterior para no mostrar datos viejos', () => {
        saveList('es', [LA_CEIBA], NOW);
        const huge = Array.from({ length: 2_000 }, (_, index) => ({ ...LA_CEIBA, slug: `restaurante-${String(index)}` }));

        expect(saveList('es', huge, NOW)).toBe(false);
        expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
        expect(loadSaved(NOW)).toBeNull();
    });

    it('si el almacenamiento no deja escribir la lista nueva, borra la anterior', () => {
        saveList('es', [LA_CEIBA], NOW);
        spyStorage().setItem.mockImplementation(quotaExceeded);

        expect(saveList('es', [EL_GUADUAL], NOW)).toBe(false);
        expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it('si ni siquiera deja borrar, no lanza y dice que no se guardó', () => {
        const blocked = (): never => {
            throw new DOMException('Bloqueado', 'SecurityError');
        };
        vi.spyOn(window, 'localStorage', 'get').mockReturnValue({ setItem: blocked, removeItem: blocked } as unknown as Storage);

        expect(saveList('es', [LA_CEIBA], NOW)).toBe(false);
    });
});

describe('la copia en otro idioma que la interfaz', () => {
    it('en el mismo idioma, se entrega tal cual', () => {
        saveList('es', [LA_CEIBA], NOW);

        expect(savedIn('es', NOW)?.restaurants).toEqual([LA_CEIBA]);
    });

    it('en otro idioma, sirve la lista y el mapa pero sin categorías ni almuerzo en el idioma equivocado', () => {
        saveList('es', [LA_CEIBA], NOW);
        const loaded = savedIn('en', NOW);

        expect(loaded?.restaurants).toEqual([{ ...LA_CEIBA, categories: [], lunch: null }]);
        expect(loaded?.savedAt).toBe(NOW);
    });

    it('sin copia, null', () => {
        expect(savedIn('en', NOW)).toBeNull();
    });
});

describe('de hace cuánto es', () => {
    it.each([
        [5_000, 'es', 'hace 1 minuto'],
        [45 * 60_000, 'es', 'hace 45 minutos'],
        [2 * 3_600_000, 'es', 'hace 2 horas'],
        [3 * 86_400_000, 'en', '3 days ago'],
    ] as const)('hace %i ms, en %s: «%s»', (ago, locale, text) => {
        expect(agoText(NOW - ago, NOW, locale)).toBe(text);
    });
});
