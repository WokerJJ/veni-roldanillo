import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| El módulo virtual de vite-plugin-pwa, simulado: la prueba dispara la versión
| nueva con las opciones del registro.
*/
const activate = vi.fn(() => Promise.resolve());
const registerSW = vi.fn((options: { onNeedRefresh?: () => void }) => {
    newVersion = () => options.onNeedRefresh?.();

    return activate;
});
let newVersion: () => void = () => undefined;

vi.mock('virtual:pwa-register', () => ({ registerSW }));

/** El aviso y el registro, copias nuevas, con la página en el idioma $locale. */
async function mountPrompt(locale: 'es' | 'en' = 'es') {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    fake.page.props.locale = locale;
    fake.page.props.translations = { ...fake.messages[locale] };

    const { registerServiceWorker } = await import('@/pwa/serviceWorker');
    registerServiceWorker();

    const { default: UpdatePrompt } = await import('./UpdatePrompt.vue');
    const wrapper = mount(UpdatePrompt);

    return { fake, wrapper, status: () => wrapper.get('[role="status"]') };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    activate.mockClear();
    vi.stubGlobal('navigator', { serviceWorker: new EventTarget() });
});

describe('UpdatePrompt', () => {
    it('sin versión nueva no se ve ni tiene botones, pero la región de estado ya está', async () => {
        const { wrapper, status } = await mountPrompt();

        expect(status().text()).toBe('');
        expect(wrapper.classes()).toContain('sr-only');
        expect(wrapper.findAll('button')).toHaveLength(0);
    });

    it('con una versión nueva avisa en la región de estado, con «Actualizar»', async () => {
        const { wrapper, status } = await mountPrompt();

        newVersion();
        await nextTick();

        expect(status().text()).toBe('Hay una versión nueva de Vení.');
        expect(wrapper.classes()).not.toContain('sr-only');
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Ahora no', 'Actualizar']);
    });

    it('los botones son reales y miden 44 px de alto', async () => {
        const { wrapper } = await mountPrompt();
        newVersion();
        await nextTick();

        for (const button of wrapper.findAll('button')) {
            expect(button.attributes('type')).toBe('button');
            expect(button.classes()).toContain('min-h-touch');
        }
    });

    it('en inglés', async () => {
        const { wrapper, status } = await mountPrompt('en');

        newVersion();
        await nextTick();

        expect(status().text()).toBe('There is a new version of Vení.');
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Not now', 'Update']);
    });

    it('«Actualizar» activa la versión nueva y el aviso se va', async () => {
        const { wrapper, status } = await mountPrompt();
        newVersion();
        await nextTick();

        await wrapper.findAll('button')[1]?.trigger('click');

        expect(activate).toHaveBeenCalledOnce();
        expect(status().text()).toBe('');
    });

    it('«Ahora no» lo cierra sin activar nada', async () => {
        const { wrapper, status } = await mountPrompt();
        newVersion();
        await nextTick();

        await wrapper.findAll('button')[0]?.trigger('click');

        expect(activate).not.toHaveBeenCalled();
        expect(status().text()).toBe('');
        expect(wrapper.findAll('button')).toHaveLength(0);
    });
});
