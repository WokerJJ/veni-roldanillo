import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AddressFields } from './addresses';
import { ADDRESS_TTL_MS, ADDRESSES_KEY, MAX_ADDRESSES, parseAddresses, resetAddressBook, useAddressBook } from './addresses';

// Un minuto atrás: lo que se lee con el reloj de verdad no queda «del futuro».
const NOW = Date.now() - 60_000;

const home: AddressFields = { label: { kind: 'home', text: '' }, neighborhood: 'El Carmen (ficticio)', address: 'Cra 5 #8-20', reference: 'casa azul', name: 'Ana' };
const work: AddressFields = { label: { kind: 'other', text: 'Donde mi mamá' }, neighborhood: '', address: 'Calle 9 #4-10', reference: '', name: '' };

const wrap = (data: unknown) => JSON.stringify({ v: 1, data });
const entry = { ...home, id: 'a1', usedAt: NOW };

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetAddressBook();
});

describe('la libreta de direcciones', () => {
    it('guarda, cambia y borra direcciones, y las lee igual al volver', () => {
        const book = useAddressBook();
        const id = book.save(home, null, NOW);
        const other = book.save(work, null, NOW + 1000);

        expect(id).not.toBeNull();
        expect(book.addresses.value.map(({ address }) => address)).toEqual(['Calle 9 #4-10', 'Cra 5 #8-20']);

        book.save({ ...home, reference: 'portón verde' }, id, NOW + 2000);
        expect(book.addresses.value).toHaveLength(2);
        expect(book.addresses.value[0]).toMatchObject({ id, reference: 'portón verde' });

        resetAddressBook();
        expect(useAddressBook().addresses.value.map(({ id: saved }) => saved)).toEqual([id, other]);

        useAddressBook().remove(String(other));
        expect(useAddressBook().addresses.value).toHaveLength(1);

        useAddressBook().clear();
        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();
    });

    it('no pasa de 10: con la libreta llena no guarda otra, pero sí cambia las que hay', () => {
        const book = useAddressBook();
        const ids = Array.from({ length: MAX_ADDRESSES }, (_, index) => book.save({ ...home, address: `Calle ${String(index)}` }, null, NOW));

        expect(book.full.value).toBe(true);
        expect(book.save(work, null, NOW)).toBeNull();
        expect(book.save(work, ids[0], NOW)).toBe(ids[0]);
        expect(book.addresses.value).toHaveLength(MAX_ADDRESSES);
    });

    it('nunca guarda la ubicación, el pago ni el efectivo, aunque lleguen', () => {
        useAddressBook().save({ ...home, location: { latitude: 4.41, longitude: -76.15 }, payment: 'cash', cashAmount: 50000 } as AddressFields, null, NOW);

        const raw = window.localStorage.getItem(ADDRESSES_KEY) ?? '';
        expect(raw).toContain('Cra 5 #8-20');
        expect(raw).not.toContain('4.41');
        expect(raw).not.toContain('cash');
        expect(raw).not.toContain('50000');
    });

    it('descarta lo que no tiene forma de dirección, una por una, y lo vencido', () => {
        expect(parseAddresses('no es json', NOW)).toEqual([]);
        expect(parseAddresses(JSON.stringify({ v: 2, data: [entry] }), NOW)).toEqual([]);
        expect(parseAddresses(wrap({ ...entry }), NOW)).toEqual([]);
        expect(parseAddresses('x'.repeat(20_001), NOW)).toEqual([]);

        const parsed = parseAddresses(
            wrap([
                entry,
                { ...entry, id: 'a2', address: 'x'.repeat(121) },
                { ...entry, id: 'a3', label: { kind: 'mansion', text: '' } },
                { ...entry, id: 'A B' },
                { ...entry, id: 'a4', usedAt: NOW + 60_000 },
                { ...entry, id: 'a5', usedAt: NOW - ADDRESS_TTL_MS - 1 },
                { ...entry, id: 'a6', name: null },
                entry,
            ]),
            NOW,
        );

        expect(parsed).toEqual([entry]);
        expect(parseAddresses(wrap(Array.from({ length: 12 }, (_, index) => ({ ...entry, id: `a${String(index)}` }))), NOW)).toHaveLength(MAX_ADDRESSES);
    });

    it('al leer una libreta dañada, la reescribe solo con lo que vale', () => {
        window.localStorage.setItem(ADDRESSES_KEY, wrap([{ ...entry, usedAt: Date.now() }, { id: 'roto' }]));

        expect(useAddressBook().addresses.value).toHaveLength(1);
        expect(window.localStorage.getItem(ADDRESSES_KEY)).not.toContain('roto');
    });

    it('sigue lo que otra pestaña escribe', () => {
        const book = useAddressBook();
        window.dispatchEvent(new StorageEvent('storage', { key: ADDRESSES_KEY, newValue: wrap([{ ...entry, usedAt: Date.now() }]) }));

        expect(book.addresses.value.map(({ id }) => id)).toEqual(['a1']);
    });

    it('sin almacenamiento (privado o bloqueado) no falla: vive en la memoria de la pestaña', () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('Bloqueado', 'SecurityError');
        });

        const book = useAddressBook();

        expect(() => book.save(home, null, NOW)).not.toThrow();
        expect(book.addresses.value).toHaveLength(1);
    });
});
