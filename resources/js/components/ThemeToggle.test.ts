import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * Copia nueva del botón (el tema es estado de módulo) con el doble de Inertia
 * reiniciado y el tema que dejó el script inline de app.blade.php.
 */
async function mountToggle(theme: 'light' | 'dark' = 'light') {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    document.documentElement.dataset.theme = theme;

    const { default: ThemeToggle } = await import('./ThemeToggle.vue');
    const wrapper = mount(ThemeToggle);

    return {
        button: () => wrapper.get('button'),
        icon: () => wrapper.get('button > svg'),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

afterEach(() => {
    delete document.documentElement.dataset.theme;
});

describe('ThemeToggle', () => {
    it('es un botón real con nombre accesible y área táctil de 44 px', async () => {
        const { button } = await mountToggle();

        expect(button().attributes('type')).toBe('button');
        expect(button().attributes('aria-label')).toBe('Modo oscuro');
        expect(button().attributes('aria-pressed')).toBe('false');
        expect(button().classes()).toEqual(expect.arrayContaining(['min-h-touch', 'min-w-touch']));
    });

    it('muestra el sol en el tema claro, como ícono decorativo', async () => {
        const { icon } = await mountToggle('light');

        expect(icon().attributes('data-icon')).toBe('sol');
        expect(icon().attributes('aria-hidden')).toBe('true');
        expect(icon().findAll('circle')).toHaveLength(1);
    });

    it('muestra la luna en el tema oscuro', async () => {
        const { button, icon } = await mountToggle('dark');

        expect(button().attributes('aria-pressed')).toBe('true');
        expect(icon().attributes('data-icon')).toBe('luna');
        expect(icon().findAll('path')).toHaveLength(1);
    });

    it('al alternar cambia el ícono sin esperar y conserva el nombre', async () => {
        const { button, icon } = await mountToggle('light');

        await button().trigger('click');

        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(button().attributes('aria-pressed')).toBe('true');
        expect(button().attributes('aria-label')).toBe('Modo oscuro');
        expect(icon().attributes('data-icon')).toBe('luna');
        expect(icon().findAll('path')).toHaveLength(1);
        expect(icon().findAll('circle')).toHaveLength(0);
    });
});
