import { describe, expect, it } from 'vitest';

import type { Locale, TranslationKey } from '@/composables/useI18n';
import type { Replacements, Translations } from '@/i18n/translate';
import { translate } from '@/i18n/translate';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';

import type { OpenStatus } from './openStatus';
import { formatClock, openStatusText, weekdayName } from './statusText';

const messages = { es, en };
/** El espacio que no parte la línea. */
const NBSP = ' ';

/** El estado en palabras, con esos textos (los de verdad de lang/, si no se dan otros). */
function text(status: OpenStatus, locale: Locale, translations: Translations = messages[locale]): string {
    const t = (key: TranslationKey, replacements?: Replacements): string => translate(translations, key, replacements);

    // Los espacios que no parten la línea se comparan como espacios comunes.
    return openStatusText(status, t, locale).replaceAll(NBSP, ' ');
}

const FRI = 5;

describe('la hora, como se dice', () => {
    it.each([
        ['18:00', '6:00 p. m.', '6:00 PM'],
        ['11:00', '11:00 a. m.', '11:00 AM'],
        ['09:05', '9:05 a. m.', '9:05 AM'],
        ['12:30', '12:30 p. m.', '12:30 PM'],
        ['00:00', '12:00 a. m.', '12:00 AM'],
        ['23:59', '11:59 p. m.', '11:59 PM'],
        ['13:00', '1:00 p. m.', '1:00 PM'],
        ['01:30', '1:30 a. m.', '1:30 AM'],
    ])('%s es «%s» y «%s», con el reloj de doce horas de cada idioma', (time, spanish, english) => {
        expect(formatClock(time, 'es').replaceAll(NBSP, ' ')).toBe(spanish);
        expect(formatClock(time, 'en').replaceAll(NBSP, ' ')).toBe(english);
    });

    it('no deja que la hora se parta al final de un renglón', () => {
        expect(formatClock('18:00', 'es')).toBe(`6:00${NBSP}p.${NBSP}m.`);
        expect(formatClock('18:00', 'en')).toBe(`6:00${NBSP}PM`);
    });

    it('nombra los días de la semana desde el domingo', () => {
        expect([0, 1, 5, 6].map((day) => weekdayName(day, 'es'))).toEqual(['domingo', 'lunes', 'viernes', 'sábado']);
        expect([0, 1, 5, 6].map((day) => weekdayName(day, 'en'))).toEqual(['Sunday', 'Monday', 'Friday', 'Saturday']);
    });
});

describe('el estado, en palabras', () => {
    it.each([
        [{ state: 'open', closes: { daysAhead: 0, weekday: 3, time: '15:00' } }, 'Abierto ahora · cierra a las 3:00 p. m.', 'Open now · closes at 3:00 PM'],
        [{ state: 'open', closes: { daysAhead: 1, weekday: 4, time: '01:00' } }, 'Abierto ahora · cierra a la 1:00 a. m.', 'Open now · closes at 1:00 AM'],
        [{ state: 'open', closes: null }, 'Abierto ahora', 'Open now'],
        [{ state: 'closed', opens: { daysAhead: 0, weekday: 3, time: '18:00' } }, 'Cerrado · abre a las 6:00 p. m.', 'Closed · opens at 6:00 PM'],
        [{ state: 'closed', opens: { daysAhead: 0, weekday: 3, time: '13:00' } }, 'Cerrado · abre a la 1:00 p. m.', 'Closed · opens at 1:00 PM'],
        // La una lleva el singular a cualquier minuto; las doce, no.
        [{ state: 'closed', opens: { daysAhead: 0, weekday: 3, time: '13:30' } }, 'Cerrado · abre a la 1:30 p. m.', 'Closed · opens at 1:30 PM'],
        [{ state: 'closed', opens: { daysAhead: 0, weekday: 3, time: '12:00' } }, 'Cerrado · abre a las 12:00 p. m.', 'Closed · opens at 12:00 PM'],
        [
            { state: 'closed', opens: { daysAhead: 1, weekday: 4, time: '11:00' } },
            'Cerrado · abre mañana a las 11:00 a. m.',
            'Closed · opens tomorrow at 11:00 AM',
        ],
        [
            { state: 'closed', opens: { daysAhead: 2, weekday: FRI, time: '18:00' } },
            'Cerrado · abre el viernes a las 6:00 p. m.',
            'Closed · opens Friday at 6:00 PM',
        ],
        [{ state: 'closed', opens: null }, 'Cerrado', 'Closed'],
        [{ state: 'unknown' }, 'Horario sin confirmar', 'Hours not confirmed'],
    ] as [OpenStatus, string, string][])('%j', (status, spanish, english) => {
        expect(text(status, 'es')).toBe(spanish);
        expect(text(status, 'en')).toBe(english);
    });

    it('el artículo de la hora sale de los textos del idioma, no del código', () => {
        const other = { ...es, 'restaurants.status.time_one': 'la mera :time', 'restaurants.status.time_many': 'las meras :time' };

        expect(text({ state: 'closed', opens: { daysAhead: 0, weekday: 3, time: '13:00' } }, 'es', other)).toBe('Cerrado · abre a la mera 1:00 p. m.');
        expect(text({ state: 'open', closes: { daysAhead: 0, weekday: 3, time: '15:00' } }, 'es', other)).toBe('Abierto ahora · cierra a las meras 3:00 p. m.');
    });
});
