import { describe, expect, it } from 'vitest';

import type { Locale, TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';
import { translate } from '@/i18n/translate';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';

import type { OpenStatus } from './openStatus';
import { formatClock, openStatusText, weekdayName } from './statusText';

const messages = { es, en };

/** El estado en palabras, con los textos de verdad de lang/. */
function text(status: OpenStatus, locale: Locale): string {
    const t = (key: TranslationKey, replacements?: Replacements): string => translate(messages[locale], key, replacements);

    // Los espacios que no parten la línea se comparan como espacios comunes.
    return openStatusText(status, t, locale).replaceAll(' ', ' ');
}

const FRI = 5;

describe('la hora, como se dice', () => {
    it.each([
        ['18:00', 'las 6:00 p. m.', '6:00 PM'],
        ['11:00', 'las 11:00 a. m.', '11:00 AM'],
        ['09:05', 'las 9:05 a. m.', '9:05 AM'],
        ['12:30', 'las 12:30 p. m.', '12:30 PM'],
        ['00:00', 'las 12:00 a. m.', '12:00 AM'],
        ['23:59', 'las 11:59 p. m.', '11:59 PM'],
        // En español la una va en singular.
        ['13:00', 'la 1:00 p. m.', '1:00 PM'],
        ['01:30', 'la 1:30 a. m.', '1:30 AM'],
    ])('%s es «%s» y «%s»', (time, spanish, english) => {
        expect(formatClock(time, 'es').replaceAll(' ', ' ')).toBe(spanish);
        expect(formatClock(time, 'en').replaceAll(' ', ' ')).toBe(english);
    });

    it('no deja que la hora se parta al final de un renglón', () => {
        expect(formatClock('18:00', 'es')).toBe('las 6:00 p. m.');
        expect(formatClock('18:00', 'en')).toBe('6:00 PM');
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
});
