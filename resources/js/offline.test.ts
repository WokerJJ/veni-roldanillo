import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '@/composables/useI18n';
import { THEME_STORAGE_KEY } from '@/composables/useTheme';

// useI18n importa Inertia; aquí solo se le pide la clave.
vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| resources/js/offline.ts corre al cargarse, como el script clásico que es en
| la página sin conexión: cada prueba arma la página, importa una copia nueva
| y mira lo que dejó en <html>. Las claves de localStorage son las de la app
| (el script no puede importarlas: repite los literales).
*/

function fakeSystemTheme(dark: boolean): void {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: dark })),
    );
}

function fakeLanguages(languages: string[]): void {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

/** El cuerpo de resources/views/offline.blade.php, con lo que el script toca. */
function renderPage(): void {
    document.body.innerHTML = ['es', 'en']
        .map(
            (locale) => `
                <section lang="${locale}" data-locale="${locale}" data-title="título ${locale} · Vení Roldanillo">
                    <h1>título ${locale}</h1>
                    <button type="button" data-retry>reintentar ${locale}</button>
                </section>`,
        )
        .join('');
}

async function loadScript(): Promise<void> {
    vi.resetModules();
    await import('./offline');
    document.dispatchEvent(new Event('DOMContentLoaded'));
}

const root = document.documentElement;
let reload: ReturnType<typeof vi.fn>;

/**
 * Lo que el script deja escuchando en document y window. En la página corre
 * una sola vez; aquí, una copia por prueba: se quita al terminar para que la
 * copia anterior no responda en la prueba siguiente.
 */
const listeners: [EventTarget, string, EventListenerOrEventListenerObject][] = [];

function recordListeners(target: Document | Window): void {
    const add = target.addEventListener.bind(target);

    vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject | null) => {
        if (listener !== null) {
            listeners.push([target, type, listener]);
            add(type, listener);
        }
    });
}

beforeEach(() => {
    recordListeners(document);
    recordListeners(window);
    window.localStorage.clear();
    fakeSystemTheme(false);
    fakeLanguages(['es-CO', 'es']);
    reload = vi.fn();
    vi.stubGlobal('location', { reload });
    renderPage();
});

afterEach(() => {
    for (const [target, type, listener] of listeners.splice(0)) {
        target.removeEventListener(type, listener);
    }

    root.removeAttribute('lang');
    delete root.dataset.locale;
    delete root.dataset.theme;
    document.body.innerHTML = '';
});

describe('idioma de la página sin conexión', () => {
    it('el último con que respondió la app en este dispositivo', async () => {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

        await loadScript();

        expect(root.lang).toBe('en');
        expect(root.dataset.locale).toBe('en');
        expect(document.title).toBe('título en · Vení Roldanillo');
    });

    it('sin ninguno guardado, el primero del teléfono que la app tenga', async () => {
        fakeLanguages(['fr-FR', 'en-US', 'es']);

        await loadScript();

        expect(root.dataset.locale).toBe('en');
    });

    it('si el teléfono no tiene ninguno de los dos, español', async () => {
        fakeLanguages(['fr-FR', 'de']);

        await loadScript();

        expect(root.dataset.locale).toBe('es');
        expect(document.title).toBe('título es · Vení Roldanillo');
    });

    it('ignora un valor guardado que no es un idioma de la app', async () => {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, 'pt');

        await loadScript();

        expect(root.dataset.locale).toBe('es');
    });

    it('con el almacenamiento bloqueado, sigue al teléfono', async () => {
        const blocked = (): never => {
            throw new DOMException('Acceso denegado', 'SecurityError');
        };
        vi.stubGlobal('localStorage', { getItem: vi.fn(blocked) });
        fakeLanguages(['en']);

        await loadScript();

        expect(root.dataset.locale).toBe('en');
        expect(root.dataset.theme).toBe('light');
    });
});

describe('tema de la página sin conexión', () => {
    it('el elegido en la app', async () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

        await loadScript();

        expect(root.dataset.theme).toBe('dark');
    });

    it('sin elección, el del sistema', async () => {
        fakeSystemTheme(true);

        await loadScript();

        expect(root.dataset.theme).toBe('dark');
    });
});

/*
| La vista trae un <meta name="theme-color"> por tema y el navegador elige
| con `media`, según el sistema. Si en la app se eligió el otro tema, la barra
| del sistema quedaría de un color y la página de otro.
*/
describe('barra del sistema de la página sin conexión', () => {
    const LIGHT = '#ffffff';
    const DARK = '#2b1b2e';

    function renderThemeColors(): void {
        document.head.insertAdjacentHTML(
            'beforeend',
            `<meta name="theme-color" content="${LIGHT}" media="(prefers-color-scheme: light)">` +
                `<meta name="theme-color" content="${DARK}" media="(prefers-color-scheme: dark)">`,
        );
    }

    const themeColors = (): string[] => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => meta.content);

    afterEach(() => {
        for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) {
            meta.remove();
        }
    });

    it('con el tema oscuro elegido y el sistema en claro, toma el color del oscuro', async () => {
        renderThemeColors();
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

        await loadScript();

        expect(themeColors()).toEqual([DARK, DARK]);
    });

    it('con el tema claro elegido y el sistema en oscuro, toma el color del claro', async () => {
        renderThemeColors();
        fakeSystemTheme(true);
        window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

        await loadScript();

        expect(themeColors()).toEqual([LIGHT, LIGHT]);
    });

    it('sin elección, queda el del sistema', async () => {
        renderThemeColors();
        fakeSystemTheme(true);

        await loadScript();

        expect(themeColors()).toEqual([DARK, DARK]);
    });

    it('sin esas etiquetas, la página se pinta igual', async () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

        await loadScript();

        expect(root.dataset.theme).toBe('dark');
    });
});

describe('volver a intentar', () => {
    it('el botón recarga la página que se quiso abrir', async () => {
        await loadScript();

        document.querySelector<HTMLButtonElement>('[data-locale="es"] [data-retry]')?.click();

        expect(reload).toHaveBeenCalledOnce();
    });

    it('con la señal de vuelta, recarga sola', async () => {
        await loadScript();

        window.dispatchEvent(new Event('online'));

        expect(reload).toHaveBeenCalled();
    });
});
