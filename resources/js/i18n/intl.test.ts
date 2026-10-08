import { describe, expect, it } from 'vitest';

import { formatDate, formatDay, formatPesos, intlLocale } from './intl';

/** El espacio que no parte la línea, que Intl pone entre el símbolo y la cifra. */
const NBSP = ' ';

/** Los espacios que no parten la línea se comparan como espacios comunes. */
function plain(text: string): string {
    return text.replaceAll(NBSP, ' ');
}

describe('intlLocale', () => {
    it('las fechas, las horas y los precios se escriben como en Colombia; en inglés, como en Estados Unidos', () => {
        expect(intlLocale('es')).toBe('es-CO');
        expect(intlLocale('en')).toBe('en-US');
    });
});

describe('formatPesos', () => {
    it.each([
        [18500, '$ 18.500', 'COP 18,500'],
        [900, '$ 900', 'COP 900'],
        [1250000, '$ 1.250.000', 'COP 1,250,000'],
        [0, '$ 0', 'COP 0'],
    ])('%d pesos son «%s» y «%s»: sin decimales y con los miles de cada idioma', (amount, spanish, english) => {
        expect(plain(formatPesos(amount, 'es'))).toBe(spanish);
        expect(plain(formatPesos(amount, 'en'))).toBe(english);
    });

    it('en inglés lleva el código de la moneda: un turista no lo toma por dólares', () => {
        expect(formatPesos(18500, 'en')).toContain('COP');
        expect(formatPesos(18500, 'en')).not.toContain('$');
    });

    it('el símbolo y la cifra no se separan al final de un renglón', () => {
        expect(formatPesos(18500, 'es')).toBe(`$${NBSP}18.500`);
    });
});

describe('formatDay', () => {
    it('escribe el día de la semana y la fecha, sin el año', () => {
        expect(formatDay('2026-10-12', 'es')).toBe('lunes, 12 de octubre');
        expect(formatDay('2026-10-12', 'en')).toBe('Monday, October 12');
    });

    it('es la fecha que dice el texto, sin correrse por la zona del dispositivo', () => {
        // El primero y el último día del año: un corrimiento de horas los cambiaría de año.
        expect(formatDay('2026-01-01', 'es')).toBe('jueves, 1 de enero');
        expect(formatDay('2026-12-31', 'es')).toBe('jueves, 31 de diciembre');
    });

    it('lo que no es una fecha vuelve tal cual', () => {
        expect(formatDay('mañana', 'es')).toBe('mañana');
        expect(formatDay('', 'en')).toBe('');
    });
});

describe('formatDate', () => {
    it('escribe la fecha con el año', () => {
        expect(formatDate('2026-10-08', 'es')).toBe('8 de octubre de 2026');
        expect(formatDate('2026-10-08', 'en')).toBe('October 8, 2026');
    });

    it('lo que no es una fecha vuelve tal cual', () => {
        expect(formatDate('2026-10', 'es')).toBe('2026-10');
    });
});
