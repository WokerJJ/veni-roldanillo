import { enableAutoUnmount, mount } from '@vue/test-utils';
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

// Desmonta cada componente al terminar: si no, los listeners de storage de
// copias anteriores del módulo siguen vivos y tocan data-theme en otras pruebas.
enableAutoUnmount(afterEach);

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
        fakeSystemTheme(true);
        // Arranca oscuro y sin elección: un valor que se tomara por válido o
        // que devolviera al sistema dejaría algo distinto de 'light'.
        document.documentElement.dataset.theme = 'dark';
        const { api, key } = await mountTheme();
        api.toggleTheme();
        expect(api.theme.value).toBe('light');

        dispatchStorage('otra:clave', 'dark');
        expect(api.theme.value).toBe('light');

        dispatchStorage(key, 'violeta');
        expect(api.theme.value).toBe('light');
        expect(appliedTheme()).toBe('light');
    });

    it('un valor inválido de otra pestaña no borra la elección manual', async () => {
        const system = fakeSystemTheme(false);
        const { api, key } = await mountTheme();
        api.toggleTheme();
        expect(api.theme.value).toBe('dark');

        dispatchStorage(key, 'violeta');
        expect(api.theme.value).toBe('dark');

        // La elección sigue siendo manual: el sistema no la pisa.
        system.setDark(false);
        expect(api.theme.value).toBe('dark');
        expect(appliedTheme()).toBe('dark');
    });

    it('funciona con localStorage bloqueado: la elección vale en memoria', async () => {
        const system = fakeSystemTheme(false);
        const blocked = (): never => {
            throw new DOMException('Acceso denegado', 'SecurityError');
        };
        // stubGlobal y no spyOn(Storage.prototype): el Storage de happy-dom es un
        // Proxy que guarda los métodos en la instancia al primer uso, y el bloqueo
        // se filtraría a las pruebas siguientes. unstubGlobals lo deshace.
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(blocked),
            setItem: vi.fn(blocked),
        });

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

/*
| La barra del sistema: app.blade.php la pinta según el sistema (media) y el
| tema de la app la ajusta. Los colores, como en resources/css/app.css: el
| fondo de la cabecera (--canvas) de cada tema.
*/
describe('color de la barra del sistema', () => {
    const LIGHT = '#FFFFFF';
    const DARK = '#2A1638';
    let fixtures: HTMLElement[] = [];

    function themeColors(): string[] {
        return [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => meta.content);
    }

    beforeEach(() => {
        const style = document.createElement('style');
        style.textContent = `:root { --canvas: ${LIGHT}; } :root[data-theme='dark'] { --canvas: ${DARK}; }`;

        const light = document.createElement('meta');
        light.name = 'theme-color';
        light.content = LIGHT;
        light.media = '(prefers-color-scheme: light)';

        const dark = document.createElement('meta');
        dark.name = 'theme-color';
        dark.content = DARK;
        dark.media = '(prefers-color-scheme: dark)';

        fixtures = [style, light, dark];
        document.head.append(...fixtures);
    });

    afterEach(() => {
        fixtures.forEach((element) => {
            element.remove();
        });
    });

    it('al alternar, las dos toman el fondo del tema elegido', async () => {
        fakeSystemTheme(false);
        const { api } = await mountTheme();

        api.toggleTheme();
        expect(themeColors()).toEqual([DARK, DARK]);

        api.toggleTheme();
        expect(themeColors()).toEqual([LIGHT, LIGHT]);
    });

    it('al arrancar sigue al tema que aplicó el script de la vista raíz', async () => {
        // Sistema claro y oscuro guardado en el dispositivo.
        fakeSystemTheme(false);
        window.localStorage.setItem('veni:theme', 'dark');
        document.documentElement.dataset.theme = 'dark';

        await mountTheme();

        expect(themeColors()).toEqual([DARK, DARK]);
    });

    it('sin elección propia sigue al sistema cuando cambia', async () => {
        const system = fakeSystemTheme(false);
        await mountTheme();

        system.setDark(true);

        expect(themeColors()).toEqual([DARK, DARK]);
    });
});
