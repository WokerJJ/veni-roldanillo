import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELIVERY_PREFIX, saveCart } from '@/order/storage';
import { resetOrders, useOrder } from '@/order/useOrder';

import { ADDRESSES_KEY, resetAddressBook, useAddressBook } from './addresses';
import { clearAllSaved } from './clearAll';
import { FAVORITES_KEY, resetFavorites, useFavorites } from './favorites';

/*
| Regla 2 de producto (ADR 0032): las direcciones y los favoritos nunca van al
| servidor. Dos pruebas: el código de la libreta, los favoritos y sus
| pantallas no tiene con qué pedir nada, y guardar, leer y borrar no pide nada.
*/
const FILES = [
    'resources/js/device/localStore.ts',
    'resources/js/saved/addresses.ts',
    'resources/js/saved/favorites.ts',
    'resources/js/saved/clearAll.ts',
    'resources/js/components/FavoriteButton.vue',
    'resources/js/components/SavedOnDevice.vue',
    'resources/js/saved/labels.ts',
    'resources/js/components/OrderCart.vue',
    'resources/js/components/RestaurantList.vue',
];

/** Lo único permitido: la lista del inicio navega a las fichas con el <Link> de Inertia, que no lleva nada de lo guardado. */
const ALLOWED: Partial<Record<string, RegExp>> = {
    'resources/js/components/RestaurantList.vue': /^import \{ Link \} from '@inertiajs\/vue3';$/m,
};

const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|axios|@inertiajs|\brouter\b|navigator\.serviceWorker/;

afterEach(() => {
    window.localStorage.clear();
    resetAddressBook();
    resetFavorites();
    resetOrders();
});

describe('lo guardado en el dispositivo no sale del teléfono', () => {
    it.each(FILES)('%s no tiene con qué hacer una petición', (file) => {
        const allowed = ALLOWED[file];
        const source = readFileSync(file, 'utf8');

        expect(allowed === undefined ? source : source.replace(allowed, '')).not.toMatch(NETWORK);
    });

    it('guardar, leer y borrar no hace ninguna petición', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
        const beacon = vi.fn();
        Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });

        const book = useAddressBook();
        const id = book.save({ label: { kind: 'home', text: '' }, neighborhood: 'Centro', address: 'Cra 5', reference: '', name: '' });
        book.save({ label: { kind: 'work', text: '' }, neighborhood: '', address: 'Calle 9', reference: '', name: 'Ana' }, id);
        useFavorites().toggle('la-ceiba');
        resetAddressBook();
        resetFavorites();
        useAddressBook().addresses.value.forEach(({ id: saved }) => {
            useAddressBook().remove(saved);
        });
        useFavorites().toggle('la-ceiba');
        clearAllSaved();

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
        expect(beacon).not.toHaveBeenCalled();
        Reflect.deleteProperty(navigator, 'sendBeacon');
    });
});

describe('«Borrar todo lo guardado»', () => {
    it('borra direcciones, favoritos, datos de entrega y pedidos sin enviar; deja el idioma y el tema', () => {
        useAddressBook().save({ label: { kind: 'home', text: '' }, neighborhood: '', address: 'Cra 5', reference: '', name: '' });
        useFavorites().toggle('la-ceiba');
        window.localStorage.setItem(`${DELIVERY_PREFIX}la-ceiba`, '{}');
        const order = useOrder('la-ceiba');
        order.add({ dish: 'Jugo', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null });
        saveCart('el-guadual', [{ dish: 'Jugo', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null }]);
        window.localStorage.setItem('veni:locale', 'es');
        window.localStorage.setItem('veni:theme', 'dark');

        clearAllSaved();

        expect(Object.keys(window.localStorage).sort()).toEqual(['veni:locale', 'veni:theme']);
        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
        expect(order.items.value).toEqual([]);
        expect(useAddressBook().addresses.value).toEqual([]);
        expect(useFavorites().slugs.value).toEqual([]);
    });
});
