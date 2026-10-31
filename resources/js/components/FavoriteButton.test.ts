import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAVORITES_KEY, resetFavorites, useFavorites } from '@/saved/favorites';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountButton(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: FavoriteButton } = await import('./FavoriteButton.vue');

    return mount(FavoriteButton, { props: { slug: 'la-ceiba', name: 'La Ceiba' }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

afterEach(() => {
    window.localStorage.clear();
    resetFavorites();
});

describe('FavoriteButton', () => {
    it('es un botón de alternar con un nombre que no cambia; marcar y desmarcar se guarda y se anuncia', async () => {
        const wrapper = await mountButton();
        const button = wrapper.get('[data-favorite]');

        expect(button.element.tagName).toBe('BUTTON');
        expect(button.attributes('type')).toBe('button');
        expect(button.text()).toBe('Favorito');
        expect(button.attributes('aria-pressed')).toBe('false');

        await button.trigger('click');
        await flushPromises();

        expect(button.attributes('aria-pressed')).toBe('true');
        expect(button.text()).toBe('Favorito');
        expect(wrapper.get('[data-favorite-status]').text()).toBe('Se agregó La Ceiba a tus favoritos.');
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(JSON.stringify({ v: 1, data: ['la-ceiba'] }));

        await button.trigger('click');
        await flushPromises();

        expect(button.attributes('aria-pressed')).toBe('false');
        expect(wrapper.get('[data-favorite-status]').text()).toBe('Se quitó La Ceiba de tus favoritos.');
        expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
    });

    it('sigue a los demás botones del mismo restaurante y a lo que se borra en otro lado', async () => {
        const wrapper = await mountButton('en');

        useFavorites().toggle('la-ceiba');
        await flushPromises();
        expect(wrapper.get('[data-favorite]').attributes('aria-pressed')).toBe('true');
        expect(wrapper.get('[data-favorite]').text()).toBe('Favorite');

        useFavorites().clear();
        await flushPromises();
        expect(wrapper.get('[data-favorite]').attributes('aria-pressed')).toBe('false');
    });
});
