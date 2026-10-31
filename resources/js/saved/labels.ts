import type { TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';

import type { AddressLabel, AddressLabelKind } from './addresses';

type Translate = (key: TranslationKey, replacements?: Replacements) => string;

export const LABEL_KINDS: readonly AddressLabelKind[] = ['home', 'work', 'other'];

export const LABEL_KEYS: Record<AddressLabelKind, TranslationKey> = {
    home: 'address.label_home',
    work: 'address.label_work',
    other: 'address.label_other',
};

/**
 * Cómo se lee la etiqueta de una dirección: «Casa» y «Trabajo» se guardan
 * como clave y se traducen al idioma de la pantalla; «Otra», con lo que
 * escribió la persona, tal cual.
 */
export function labelText(label: AddressLabel, t: Translate): string {
    if (label.kind === 'other') {
        return label.text.trim() === '' ? t('address.label_other_default') : label.text.trim();
    }

    return t(LABEL_KEYS[label.kind]);
}

/** La etiqueta que se propone para una dirección nueva: «Casa» si no hay, luego «Trabajo», luego «Otra». */
export function suggestedKind(addresses: readonly { label: AddressLabel }[]): AddressLabelKind {
    const used = new Set(addresses.map(({ label }) => label.kind));

    if (!used.has('home')) {
        return 'home';
    }

    return used.has('work') ? 'other' : 'work';
}
