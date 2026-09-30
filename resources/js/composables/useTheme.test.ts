import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import type * as ThemeModule from './useTheme';

type ChangeListener = (event: MediaQueryListEvent) => void;

/** matchMedia controlable: permite simular el cambio de tema del sistema. */
function fakeSystemTheme(initialDark: boolean) {
    let matches = initialDark;
    const listeners = new Set<ChangeListener>();

    const media = {
        get matches() {
            return matches;
        },
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
        removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    };

    vi.stubGlobal('matchMedia', vi.fn(() => media));

    return {
        listeners,
        setDark(dark: boolean): void {
            matches = dark;
            listeners.forEach((listener) => {
                listener({ matches: dark } as MediaQueryListEvent);
            });
        },
    };
}

/**
 * El estado del composable es de módulo (compartido entre componentes): cada
 * prueba importa una copia nueva para empezar sin elección previa.
 */
async function mountTheme() {
    const module: typeof ThemeModule = await import('./useTheme');
    let api!: ReturnType<typeof module.useTheme>;

    const wrapper = mount(
        defineComponent({
            setup() {
                api = module.useTheme();

                return () => null;
            },
        }),
    );

    return { api, wrapper, key: module.THEME_STORAGE_KEY };
}

function dispatchStorage(key: string | null, newValue: string | null): void {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

function appliedTheme(): string | undefined {
    return document.documentElement.dataset.theme;
}

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    // Lo que deja el script inline de app.blade.php antes de pintar.
    document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
    delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
    it('parte del tema que aplicó el script inline', async () => {
        fakeSystemTheme(true);
        document.documentElement.dataset.theme = 'dark';

        const { api } = await mountTheme();

        expect(api.theme.value).toBe('dark');
        expect(api.isDark.value).toBe(true);
    });

    it('sin elección del usuario sigue al sistema', async () => {
        const system = fakeSystemTheme(false);
        const { api } = await mountTheme();

        system.setDark(true);

        expect(api.theme.value).toBe('dark');
        expect(appliedTheme()).toBe('dark');
    });

    it('la elección manual gana sobre el sistema y queda guardada', async () => {
        const system = fakeSystemTheme(false);
        const { api, key } = await mountTheme();

        api.toggleTheme();
        system.setDark(false);

        expect(api.theme.value).toBe('dark');
        expect(appliedTheme()).toBe('dark');
        expect(window.localStorage.getItem(key)).toBe('dark');
    });

    it('una elección guardada en otra visita también gana sobre el sistema', async () => {
        const system = fakeSystemTheme(false);
        window.localStorage.setItem('veni:theme', 'light');

        const { api } = await mountTheme();
        system.setDark(true);

        expect(api.theme.value).toBe('light');
    });

    it('se sincroniza cuando otra pestaña guarda una elección', async () => {
        const system = fakeSystemTheme(false);
        const { api, key } = await mountTheme();

        dispatchStorage(key, 'dark');

        expect(api.theme.value).toBe('dark');
        expect(appliedTheme()).toBe('dark');

        // La elección de la otra pestaña también es manual.
        system.setDark(false);
        expect(api.theme.value).toBe('dark');
    });

    it('vuelve al sistema cuando otra pestaña borra la preferencia', async () => {
        const system = fakeSystemTheme(true);
        const { api, key } = await mountTheme();
        api.toggleTheme();
        api.toggleTheme();
        expect(api.theme.value).toBe('light');

        // localStorage.clear() en otra pestaña llega con key null.
        dispatchStorage(null, null);
        expect(api.theme.value).toBe('dark');

        system.setDark(false);
        expect(api.theme.value).toBe('light');

        dispatchStorage(key, 'dark');
        dispatchStorage(key, null);
        expect(api.theme.value).toBe('light');
    });

    it('ignora cambios de otras claves y valores inválidos', async () => {
        fakeSystemTheme(false);
        const { api, key } = await mountTheme();

        dispatchStorage('otra:clave', 'dark');
        expect(api.theme.value).toBe('light');

        dispatchStorage(key, 'violeta');
        expect(api.theme.value).toBe('light');
    });

    it('funciona con localStorage bloqueado: la elección vale en memoria', async () => {
        const system = fakeSystemTheme(false);
        const blocked = (): never => {
            throw new DOMException('Acceso denegado', 'SecurityError');
        };
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);

        const { api } = await mountTheme();

        expect(() => {
            api.toggleTheme();
        }).not.toThrow();
        expect(api.theme.value).toBe('dark');

        system.setDark(false);
        expect(api.theme.value).toBe('dark');
        expect(appliedTheme()).toBe('dark');
    });

    it('deja de escuchar al desmontar el componente', async () => {
        const system = fakeSystemTheme(false);
        const { api, wrapper, key } = await mountTheme();
        expect(system.listeners.size).toBe(1);

        wrapper.unmount();
        dispatchStorage(key, 'dark');

        expect(system.listeners.size).toBe(0);
        expect(api.theme.value).toBe('light');
    });
});
