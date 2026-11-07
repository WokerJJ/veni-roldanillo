import type { Locale, TranslationKey } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { Replacements } from '@/i18n/translate';

import type { PriceRange } from './api';

type Translate = (key: TranslationKey, replacements?: Replacements) => string;

/**
 * El rango de precios de la carta como lo lee una persona (#127, ADR 0039):
 * en la ficha y en la lista. Baja con ellas, no con el arranque.
 *
 * «Platos de $ 16.000 a $ 22.000», o «Platos a $ 15.000» si los dos son el mismo.
 */
export function priceRangeText(range: Readonly<PriceRange>, t: Translate, locale: Locale): string {
    return range.min === range.max
        ? t('restaurant.price_single', { price: formatPesos(range.min, locale) })
        : t('restaurant.price_range', { min: formatPesos(range.min, locale), max: formatPesos(range.max, locale) });
}
