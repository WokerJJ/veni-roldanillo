import { describe, expect, it } from 'vitest';

import type { TranslationKey } from '@/composables/useI18n';
import type { Replacements } from '@/i18n/translate';
import { translate } from '@/i18n/translate';
import type { MenuDish } from '@/restaurants/profile';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';
import type { OrderContext } from './checkout';
import { emptyDetails } from './checkout';
import { orderMessage } from './message';
import type { OrderItem } from './selection';
import { emptySelection, toOrderItem } from './selection';
import { loadCart, saveCart } from './storage';

/*
| Las bebidas alcohólicas en el pedido (ADR 0050): el plato lo marca, el
| ítem lo conserva, el carrito guardado no lo pierde y el mensaje de WhatsApp
| lo dice. Un pedido sin alcohol sale exactamente igual que antes.
*/

const tEs = (key: TranslationKey, replacements?: Replacements): string => translate(es, key, replacements);
const tEn = (key: TranslationKey, replacements?: Replacements): string => translate(en, key, replacements);
const money = (amount: number): string => `$${String(amount)}`;

const NOW = Date.UTC(2026, 10, 19, 17);
const context: OrderContext = { deliveryAvailable: false, zones: [], paymentMethods: ['cash'] };

function dish(overrides: Partial<MenuDish> = {}): MenuDish {
    return { name: 'Cerveza Águila Botella 330 ml', description: null, price: 4500, sold_out_until: null, groups: [], ...overrides };
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
    return { dish: 'Cerveza Águila Botella 330 ml', unitPrice: 4500, quantity: 2, choices: [], removed: [], note: null, ...overrides };
}

describe('el ítem del pedido', () => {
    it('conserva la marca de alcohol del plato', () => {
        const selection = emptySelection(dish({ alcohol: true }));

        expect(toOrderItem(dish({ alcohol: true }), selection)).toMatchObject({ dish: 'Cerveza Águila Botella 330 ml', alcohol: true });
    });

    it('un plato sin la marca, o con ella en falso, no la lleva: el pedido de siempre queda igual', () => {
        for (const menuDish of [dish(), dish({ alcohol: false })]) {
            const built = toOrderItem(menuDish, emptySelection(menuDish));

            expect(built).not.toBeNull();
            expect(built).not.toHaveProperty('alcohol');
        }
    });
});

describe('el carrito guardado en el dispositivo', () => {
    it('no pierde la marca de alcohol al guardarse y leerse', () => {
        saveCart('la-ceiba', [item({ alcohol: true })], NOW);

        expect(loadCart('la-ceiba', NOW + 1000)).toEqual([item({ alcohol: true })]);
    });

    it('un carrito guardado antes (sin la marca) se lee igual, sin alcohol', () => {
        saveCart('la-ceiba', [item()], NOW);

        expect(loadCart('la-ceiba', NOW + 1000)[0]).not.toHaveProperty('alcohol');
    });
});

describe('el mensaje de WhatsApp', () => {
    const details = emptyDetails(context);

    it('dice que incluye bebidas alcohólicas para mayores de 18, en español y en inglés', () => {
        const items = [item({ dish: 'Sancocho de prueba', unitPrice: 18500, quantity: 1 }), item({ alcohol: true })];

        expect(orderMessage(items, details, context, tEs, money)).toContain('Incluye bebidas alcohólicas: solo para mayores de 18 años.');
        expect(orderMessage(items, details, context, tEn, money)).toContain('Includes alcoholic drinks: only for people over 18.');
    });

    it('lo dice una sola vez aunque haya varias bebidas', () => {
        const items = [item({ alcohol: true }), item({ dish: 'Aguardiente Antioqueño Trago', alcohol: true })];

        expect(orderMessage(items, details, context, tEs, money).match(/mayores de 18/g)).toHaveLength(1);
    });

    it('un pedido sin alcohol no lo menciona', () => {
        expect(orderMessage([item()], details, context, tEs, money)).not.toContain('18');
    });
});
