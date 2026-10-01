import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import type * as FakeInertia from '@/testing/inertia';

import type * as I18nModule from './useI18n';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * El watcher de <html lang> es de módulo: cada prueba importa una copia nueva
 * del composable. El doble se pide por '@inertiajs/vue3' (la misma copia que
 * ve el composable) y se reinicia.
 */
async function load() {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    const module: typeof I18nModule = await import('./useI18n');

    return { fake, useI18n: module.useI18n };
}

/** Componente que traduce el título del inicio con el composable de la prueba. */
function mountHeading(useI18n: typeof I18nModule.useI18n) {
    return mount(
        defineComponent({
            setup() {
                const { t } = useI18n();

                return () => h('h1', t('home.heading'));
            },
        }),
    );
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    // Lo que deja el servidor en <html lang> antes de que arranque Vue.
    document.documentElement.lang = 'es';
});

describe('useI18n', () => {
    it('traduce con los textos que comparte el servidor e interpola', async () => {
        const { useI18n } = await load();
        const { t, locale } = useI18n();

        expect(locale.value).toBe('es');
        expect(t('home.title')).toBe('Inicio');
        expect(t('layout.footer', { year: 2026 })).toContain('© 2026 Vení Roldanillo');
    });

    it('una clave que no llegó del servidor se muestra como la clave', async () => {
        const { fake, useI18n } = await load();
        fake.page.props.translations = {};

        expect(useI18n().t('home.title')).toBe('home.title');
    });

    it('al cambiar el idioma sin recargar, cambian los textos y <html lang>', async () => {
        const { fake, useI18n } = await load();

        const wrapper = mountHeading(useI18n);
        expect(wrapper.text()).toBe('Vení, comamos en Roldanillo');

        // Lo que hace Inertia al recibir la página en inglés.
        fake.page.props.locale = 'en';
        fake.page.props.translations = { ...fake.messages.en };
        await nextTick();

        expect(wrapper.text()).toBe('Come eat in Roldanillo');
        expect(document.documentElement.lang).toBe('en');
    });

    it('mantiene <html lang> aunque se desmonte el componente que lo empezó a seguir', async () => {
        const { fake, useI18n } = await load();
        mountHeading(useI18n).unmount();

        fake.page.props.locale = 'en';
        await nextTick();

        expect(document.documentElement.lang).toBe('en');
    });
});
