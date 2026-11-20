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

/** La lista que guarda resources/js/restaurants/savedList.ts (#144): la clave y la vigencia, repetidas aquí por lo mismo. */
const SAVED_KEY = 'veni:restaurants';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

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

/** De hace cuánto es la copia: «hace 2 horas». Lo mismo que agoText de savedList.ts. */
function ago(savedAt: number): string {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const minutes = Math.max(1, Math.round((Date.now() - savedAt) / 60_000));
    const hours = Math.round(minutes / 60);

    return minutes < 60 ? rtf.format(-minutes, 'minute') : hours < 24 ? rtf.format(-hours, 'hour') : rtf.format(-Math.round(hours / 24), 'day');
}

/** Los nombres de la última lista que llegó a este teléfono, con su hora, si hay una vigente. Solo texto: nada de lo guardado se pinta como HTML. */
function showSaved(block: HTMLElement): void {
    const raw = stored(SAVED_KEY);
    const saved = block.querySelector<HTMLElement>('[data-saved]');
    const when = block.querySelector<HTMLElement>('[data-saved-ago]');
    const list = block.querySelector<HTMLElement>('[data-saved-list]');

    if (raw === null || saved === null || when === null || list === null) {
        return;
    }

    try {
        const body = JSON.parse(raw) as { version?: unknown; savedAt?: unknown; locale?: unknown; restaurants?: unknown };
        const at = body.savedAt;

        if (body.version !== 1 || typeof at !== 'number' || at > Date.now() || Date.now() - at > MAX_AGE_MS || !Array.isArray(body.restaurants)) {
            return;
        }

        for (const restaurant of body.restaurants as { name?: unknown; categories?: { name?: unknown }[] }[]) {
            if (typeof restaurant.name === 'string') {
                const item = document.createElement('li');
                // Las categorías vienen en el idioma en que se guardó: en otro, solo el nombre.
                const categories = (body.locale === locale ? (restaurant.categories ?? []) : []).map((category) => category.name).filter((name) => typeof name === 'string');

                item.textContent = categories.length === 0 ? restaurant.name : `${restaurant.name} · ${categories.join(', ')}`;
                list.append(item);
            }
        }

        when.textContent = (when.dataset.template ?? '').replace(':time', ago(at));
        saved.hidden = list.childElementCount === 0;
    } catch {
        // Una copia rota no tapa el aviso: la página sigue sin la lista.
    }
}

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

    if (block !== null) {
        showSaved(block);
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-retry]')) {
        button.addEventListener('click', retry);
    }
});

// Para TypeScript es un módulo (lo importan sus pruebas); la compilación no
// deja ningún export en el archivo.
export {};
