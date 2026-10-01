import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * Copia nueva del selector (y del composable que usa) con el doble de Inertia
 * reiniciado. El doble responde al PUT como el servidor: la página vuelve en
 * el idioma pedido.
 */
async function mountSwitcher() {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    fake.router.put.mockImplementation((_url: string, data: { locale: 'es' | 'en' }) => {
        fake.page.props.locale = data.locale;
        fake.page.props.translations = { ...fake.messages[data.locale] };
    });

    const { default: LocaleSwitcher } = await import('./LocaleSwitcher.vue');
    const wrapper = mount(LocaleSwitcher);

    return {
        fake,
        wrapper,
        group: () => wrapper.get('[role="group"]'),
        button: (locale: 'es' | 'en') => wrapper.get(`button[lang="${locale}"]`),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    // Lo que deja el servidor en <html lang> antes de que arranque Vue.
    document.documentElement.lang = 'es';
});

describe('LocaleSwitcher', () => {
    it('es un grupo de botones reales, con nombre accesible y área táctil de 44 px', async () => {
        const { wrapper, group, button } = await mountSwitcher();

        expect(group().attributes('aria-label')).toBe('Idioma (Language)');
        expect(wrapper.findAll('button')).toHaveLength(2);

        for (const locale of ['es', 'en'] as const) {
            expect(button(locale).attributes('type')).toBe('button');
            expect(button(locale).classes()).toEqual(expect.arrayContaining(['min-h-touch', 'min-w-touch']));
        }
    });

    it('nombra cada idioma en su propio idioma', async () => {
        const { button } = await mountSwitcher();

        expect(button('es').attributes('aria-label')).toBe('Español');
        expect(button('es').text()).toBe('ES');
        expect(button('en').attributes('aria-label')).toBe('English');
        expect(button('en').text()).toBe('EN');
    });

    it('marca con aria-pressed el idioma actual', async () => {
        const { button } = await mountSwitcher();

        expect(button('es').attributes('aria-pressed')).toBe('true');
        expect(button('en').attributes('aria-pressed')).toBe('false');
    });

    it('al elegir inglés lo pide al servidor sin recargar y cambia <html lang>', async () => {
        const { fake, group, button } = await mountSwitcher();

        await button('en').trigger('click');
        await nextTick();

        expect(fake.router.put).toHaveBeenCalledExactlyOnceWith(
            '/locale',
            { locale: 'en' },
            expect.objectContaining({ preserveScroll: true, preserveState: true }),
        );
        expect(document.documentElement.lang).toBe('en');
        expect(button('en').attributes('aria-pressed')).toBe('true');
        expect(button('es').attributes('aria-pressed')).toBe('false');
        expect(group().attributes('aria-label')).toBe('Language (Idioma)');
    });

    it('elegir el idioma actual no hace ninguna petición', async () => {
        const { fake, button } = await mountSwitcher();

        await button('es').trigger('click');

        expect(fake.router.put).not.toHaveBeenCalled();
        expect(document.documentElement.lang).toBe('es');
    });
});
