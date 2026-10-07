/*
| Página sin conexión (#5, resources/views/offline.blade.php). El service
| worker la muestra cuando una navegación falla sin red o tarda demasiado.
| Trae los textos en los dos idiomas y este script elige uno antes de pintar,
| igual que el tema.
|
| La vista lo carga como script clásico en <head>, que bloquea: el archivo
| compilado no puede llevar import ni export (lo vigila
| resources/js/map/bundle.test.ts). Por eso repite las claves de
| localStorage en vez de importarlas: un import lo volvería módulo.
*/

/** Mismas claves que useI18n (el idioma que respondió el servidor por última vez) y useTheme. */
const LOCALE_STORAGE_KEY = 'veni:locale';
const THEME_STORAGE_KEY = 'veni:theme';

const LOCALES = ['es', 'en'];
const DEFAULT_LOCALE = 'es';

function stored(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        // Almacenamiento bloqueado (modo privado, políticas del navegador).
        return null;
    }
}

/**
 * El idioma con que la app respondió por última vez en este dispositivo. Si
 * nunca abrió la app con red (no hay ninguno guardado), el primero del
 * teléfono que la app tenga, como hace el servidor con Accept-Language.
 */
function chooseLocale(): string {
    const saved = stored(LOCALE_STORAGE_KEY);

    if (saved !== null && LOCALES.includes(saved)) {
        return saved;
    }

    for (const language of navigator.languages) {
        const base = language.toLowerCase().split('-')[0] ?? '';

        if (LOCALES.includes(base)) {
            return base;
        }
    }

    return DEFAULT_LOCALE;
}

function chooseTheme(): string {
    const saved = stored(THEME_STORAGE_KEY);

    if (saved === 'light' || saved === 'dark') {
        return saved;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * La barra del sistema sigue al tema de la página. La vista trae un
 * <meta name="theme-color"> por tema, antes de este script, y el navegador
 * elige con `media` según el sistema: si en la app se eligió el otro tema,
 * los dos toman el color del elegido.
 */
function applyThemeColor(theme: string): void {
    const chosen = document.head.querySelector<HTMLMetaElement>(`meta[name="theme-color"][media="(prefers-color-scheme: ${theme})"]`);

    if (chosen === null) {
        return;
    }

    for (const meta of document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = chosen.content;
    }
}

const locale = chooseLocale();
const theme = chooseTheme();
const root = document.documentElement;

// La hoja de estilos (resources/css/offline.css) muestra solo el bloque de este idioma.
root.lang = locale;
root.dataset.locale = locale;
root.dataset.theme = theme;
applyThemeColor(theme);

function retry(): void {
    window.location.reload();
}

// Con la señal de vuelta, la página que se quiso abrir se pide sola.
window.addEventListener('online', retry);

document.addEventListener('DOMContentLoaded', () => {
    // El bloque del idioma, no <html>, que también lleva data-locale.
    const block = document.querySelector<HTMLElement>(`[data-title][data-locale="${locale}"]`);

    if (block?.dataset.title !== undefined) {
        document.title = block.dataset.title;
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-retry]')) {
        button.addEventListener('click', retry);
    }
});

// Para TypeScript es un módulo (lo importan sus pruebas); la compilación no
// deja ningún export en el archivo.
export {};
