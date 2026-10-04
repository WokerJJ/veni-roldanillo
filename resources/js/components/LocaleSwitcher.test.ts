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

    it('lleva el ícono de idioma como adorno: el nombre lo da el grupo', async () => {
        const { wrapper, group } = await mountSwitcher();
        const icon = group().get('svg');

        expect(icon.attributes('data-icon')).toBe('idioma');
        expect(icon.attributes('aria-hidden')).toBe('true');
        expect(icon.findAll('path').length).toBeGreaterThan(0);
        // Fuera de los botones: no cambia su texto ni su nombre.
        expect(wrapper.findAll('button svg')).toHaveLength(0);
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

/*
| Cambiar de idioma exige red (ADR 0010): los textos del otro idioma vienen
| del servidor. Sin conexión el selector avisa en vez de fallar en silencio.
*/
describe('LocaleSwitcher · sin conexión', () => {
    function goOffline(): void {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    }

    it('antes del aviso, la región de estado está vacía y no se ve', async () => {
        const { wrapper } = await mountSwitcher();
        const status = wrapper.get('[role="status"]');

        expect(status.text()).toBe('');
        expect(status.classes()).toContain('sr-only');
    });

    it('sin red no pide nada y avisa en la región de estado', async () => {
        goOffline();
        const { fake, wrapper, button } = await mountSwitcher();

        await button('en').trigger('click');

        const status = wrapper.get('[role="status"]');
        expect(fake.router.put).not.toHaveBeenCalled();
        expect(status.text()).toBe('Sin conexión no podemos cambiar el idioma. Probá de nuevo cuando vuelva la señal.');
        expect(status.classes()).not.toContain('sr-only');
        expect(button('es').attributes('aria-pressed')).toBe('true');
    });

    it('avisa también si la petición no llega aunque el teléfono diga que hay red', async () => {
        const { fake, wrapper, button } = await mountSwitcher();
        let handled: boolean | undefined;
        fake.router.put.mockImplementation((_url: string, _data: unknown, options: { onNetworkError: (error: Error) => boolean | undefined }) => {
            handled = options.onNetworkError(new Error('Network Error'));
        });

        await button('en').trigger('click');

        expect(wrapper.get('[role="status"]').text()).toContain('Sin conexión');
        // false: Inertia no sigue con su evento global ni rechaza la visita.
        expect(handled).toBe(false);
    });

    it('el aviso sale en el idioma de la página', async () => {
        goOffline();
        const { fake, wrapper, button } = await mountSwitcher();
        fake.page.props.locale = 'en';
        fake.page.props.translations = { ...fake.messages.en };
        await nextTick();

        await button('es').trigger('click');

        expect(wrapper.get('[role="status"]').text()).toBe('You are offline, so we cannot change the language. Try again when the signal is back.');
    });

    it('se va cuando vuelve la señal', async () => {
        goOffline();
        const { wrapper, button } = await mountSwitcher();
        await button('en').trigger('click');

        window.dispatchEvent(new Event('online'));
        await nextTick();

        expect(wrapper.get('[role="status"]').text()).toBe('');
    });

    it('se va solo a los 10 s', async () => {
        vi.useFakeTimers();

        try {
            goOffline();
            const { wrapper, button } = await mountSwitcher();
            await button('en').trigger('click');

            vi.advanceTimersByTime(9_999);
            await nextTick();
            expect(wrapper.get('[role="status"]').text()).not.toBe('');

            vi.advanceTimersByTime(1);
            await nextTick();
            expect(wrapper.get('[role="status"]').text()).toBe('');
        } finally {
            vi.useRealTimers();
        }
    });
});
