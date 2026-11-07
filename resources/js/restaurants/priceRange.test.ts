import { describe, expect, it } from 'vitest';

import type { TranslationKey } from '@/composables/useI18n';
import { translate } from '@/i18n/translate';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';

import { parsePriceRange } from './api';
import { priceRangeText } from './priceRange';

const MESSAGES = { es, en } as const;

/** Los espacios que pone Intl (sin corte) como espacios comunes. */
const spaced = (text: string): string => text.replace(/\s/gu, ' ');

function text(min: number, max: number, locale: 'es' | 'en'): string {
    return spaced(priceRangeText({ min, max }, (key: TranslationKey, replacements) => translate(MESSAGES[locale], key, replacements), locale));
}

describe('priceRangeText', () => {
    it('dice del plato más barato al más caro, en pesos', () => {
        expect(text(16_000, 22_000, 'es')).toBe('Platos de $ 16.000 a $ 22.000');
        expect(text(16_000, 22_000, 'en')).toBe('Dishes from COP 16,000 to COP 22,000');
    });

    it('con un solo precio dice «Platos a $X»', () => {
        expect(text(15_000, 15_000, 'es')).toBe('Platos a $ 15.000');
        expect(text(15_000, 15_000, 'en')).toBe('Dishes at COP 15,000');
    });
});

describe('parsePriceRange', () => {
    it('lee el rango del servidor', () => {
        expect(parsePriceRange({ min: 16_000, max: 22_000 })).toEqual({ min: 16_000, max: 22_000 });
        expect(parsePriceRange({ min: 15_000, max: 15_000, otro: 'x' })).toEqual({ min: 15_000, max: 15_000 });
    });

    it.each([
        ['sin rango', null],
        ['una respuesta de antes de #127', undefined],
        ['al revés', { min: 22_000, max: 16_000 }],
        ['con decimales', { min: 1.5, max: 2 }],
        ['en cero', { min: 0, max: 10_000 }],
        ['como texto', { min: '16000', max: '22000' }],
        ['incompleto', { min: 16_000 }],
        ['una lista', [16_000, 22_000]],
    ])('%s es null: no se muestra', (_case, value) => {
        expect(parsePriceRange(value)).toBeNull();
    });
});
