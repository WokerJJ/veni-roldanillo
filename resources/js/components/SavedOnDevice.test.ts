import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetOrders } from '@/order/useOrder';
import type { AddressFields } from '@/saved/addresses';
import { ADDRESSES_KEY, MAX_ADDRESSES, resetAddressBook, useAddressBook } from '@/saved/addresses';
import { FAVORITES_KEY, resetFavorites, useFavorites } from '@/saved/favorites';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const HOME: AddressFields = { label: { kind: 'home', text: '' }, neighborhood: 'Centro (ficticio)', address: 'Cra 5 #8-20', reference: 'casa azul', name: 'Ana' };
const RESTAURANTS = [{ slug: 'la-ceiba', name: 'La Ceiba (prueba)' }];

async function mountSaved(restaurants: typeof RESTAURANTS | null = RESTAURANTS, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: SavedOnDevice } = await import('./SavedOnDevice.vue');

    return mount(SavedOnDevice, { props: { restaurants }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

afterEach(() => {
    window.localStorage.clear();
    resetAddressBook();
    resetFavorites();
    resetOrders();
});

describe('SavedOnDevice', () => {
    it('abre como diálogo modal con el foco en el título y dice que nada sale del teléfono', async () => {
        const wrapper = await mountSaved();
        const dialog = wrapper.get('dialog').element as HTMLDialogElement;

        expect(dialog.open).toBe(true);
        expect(document.activeElement?.textContent).toBe('Guardado en este teléfono');
        expect(wrapper.text()).toContain('Vení no los recibe');
        expect(wrapper.find('[data-addresses-empty]').exists()).toBe(true);
        expect(wrapper.find('[data-favorites-empty]').exists()).toBe(true);
    });

    it('agrega una dirección (pide la dirección si falta), la edita y la borra', async () => {
        const wrapper = await mountSaved();

        await wrapper.get('[data-address-add]').trigger('click');
        expect((wrapper.get('[data-kind="home"]').element as HTMLInputElement).checked).toBe(true);

        await wrapper.get('[data-address-form]').trigger('submit');
        await flushPromises();
        expect(wrapper.get('[data-form-address]').attributes('aria-invalid')).toBe('true');
        expect(wrapper.get('[data-error]').text()).toBe('Escribí la dirección.');
        expect(document.activeElement).toBe(wrapper.get('[data-form-address]').element);

        await wrapper.get('[data-kind="other"]').setValue(true);
        await wrapper.get('[data-form-label]').setValue('Donde mi mamá');
        await wrapper.get('[data-form-address]').setValue('Calle 9 #4-10');
        await wrapper.get('[data-form-name]').setValue('Ana');
        await wrapper.get('[data-address-form]').trigger('submit');
        await flushPromises();

        expect(wrapper.findAll('[data-saved-label]').map((label) => label.text())).toEqual(['Donde mi mamá']);
        expect(wrapper.get('[data-announcement]').text()).toBe('Se guardó «Donde mi mamá».');
        expect(useAddressBook().addresses.value).toMatchObject([{ label: { kind: 'other', text: 'Donde mi mamá' }, address: 'Calle 9 #4-10', name: 'Ana' }]);

        await wrapper.get('[data-address-edit]').trigger('click');
        expect(wrapper.get('[data-address-edit]').attributes('aria-label')).toBe('Editar «Donde mi mamá»');
        expect((wrapper.get('[data-form-address]').element as HTMLInputElement).value).toBe('Calle 9 #4-10');
        await wrapper.get('[data-kind="work"]').setValue(true);
        await wrapper.get('[data-address-form]').trigger('submit');
        await flushPromises();

        expect(wrapper.findAll('[data-saved-label]').map((label) => label.text())).toEqual(['Trabajo']);
        expect(useAddressBook().addresses.value).toHaveLength(1);

        await wrapper.get('[data-address-delete]').trigger('click');
        await flushPromises();
        expect(wrapper.get('[data-announcement]').text()).toBe('Se borró «Trabajo».');
        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();
    });

    it('con 10 direcciones no ofrece agregar otra', async () => {
        Array.from({ length: MAX_ADDRESSES }, (_, index) => useAddressBook().save({ ...HOME, address: `Calle ${String(index)}` }));
        const wrapper = await mountSaved();

        expect(wrapper.find('[data-address-add]').exists()).toBe(false);
        expect(wrapper.get('[data-addresses-full]').text()).toContain('Tenés 10 direcciones guardadas');
    });

    it('quita favoritos, con el nombre del restaurante o, si ya no está en el mapa, sin romper', async () => {
        useFavorites().toggle('ya-no-esta');
        useFavorites().toggle('la-ceiba');
        const wrapper = await mountSaved();

        expect(wrapper.findAll('[data-saved-favorite]').map((row) => row.find('span').text())).toEqual(['La Ceiba (prueba)', 'Un restaurante que ya no está en el mapa']);

        await wrapper.get('[data-favorite-remove]').trigger('click');
        await flushPromises();
        expect(useFavorites().slugs.value).toEqual(['ya-no-esta']);
        expect(wrapper.get('[data-announcement]').text()).toBe('Se quitó La Ceiba (prueba) de tus favoritos.');
    });

    it('«Borrar todo lo guardado» pide confirmar y borra direcciones y favoritos, no el idioma', async () => {
        useAddressBook().save(HOME);
        useFavorites().toggle('la-ceiba');
        window.localStorage.setItem('veni:locale', 'es');
        const wrapper = await mountSaved();

        await wrapper.get('[data-clear-all]').trigger('click');
        expect(wrapper.get('[data-clear-all-confirm]').text()).toBe('¿Borrar todo lo guardado en este teléfono?');
        await wrapper.get('[data-clear-all-no]').trigger('click');
        expect(useAddressBook().addresses.value).toHaveLength(1);

        await wrapper.get('[data-clear-all]').trigger('click');
        await wrapper.get('[data-clear-all-yes]').trigger('click');
        await flushPromises();

        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
        expect(window.localStorage.getItem('veni:locale')).toBe('es');
        expect(wrapper.find('[data-saved-address]').exists()).toBe(false);
        expect(wrapper.get('[data-announcement]').text()).toBe('Se borró todo lo guardado en este teléfono.');
    });

    it('desde el carrito (sin restaurantes) no muestra los favoritos; cierra con Escape sin que siga al documento', async () => {
        const wrapper = await mountSaved(null, 'en');
        const onDocument = vi.fn();
        document.addEventListener('keydown', onDocument);

        expect(wrapper.find('[data-favorites-title]').exists()).toBe(false);
        expect(wrapper.get('h2').text()).toBe('Saved on this phone');

        await wrapper.get('dialog').trigger('keydown', { key: 'Escape' });
        await wrapper.get('dialog').trigger('cancel');
        document.removeEventListener('keydown', onDocument);

        expect(onDocument).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
