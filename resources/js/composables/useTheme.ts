import { computed, onBeforeUnmount, onMounted, readonly, ref } from 'vue';

export type Theme = 'light' | 'dark';

/**
 * Clave en localStorage. El script inline de app.blade.php usa el mismo
 * literal (tests/Feature/RootViewTest.php comprueba que coincidan).
 */
export const THEME_STORAGE_KEY = 'veni:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark';
}

function readStoredTheme(): Theme | null {
    try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);

        return isTheme(value) ? value : null;
    } catch {
        // Almacenamiento bloqueado (modo privado, políticas del navegador).
        return null;
    }
}

/**
 * La barra del sistema (los `<meta name="theme-color">` de app.blade.php)
 * sigue al tema de la app. La vista raíz la pinta según el sistema, con
 * `media`; si en la app rige otro tema, las dos toman el fondo de la cabecera
 * (--canvas, resources/css/app.css) de ese tema.
 */
function applyThemeColor(): void {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();

    if (color === '') {
        return;
    }

    for (const meta of document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = color;
    }
}

function applyTheme(value: Theme): void {
    document.documentElement.dataset.theme = value;
    applyThemeColor();
}

// Estado compartido entre componentes. No toca window ni document al importar:
// se inicializa en la primera llamada a useTheme().
const theme = ref<Theme>('light');
let initialized = false;
// Elección manual en memoria: gana sobre el sistema aunque localStorage esté bloqueado.
let hasManualChoice = false;

function initialize(): void {
    if (initialized) {
        return;
    }

    initialized = true;
    // Una sola regla: la que ya aplicó el script inline antes de pintar.
    const current = document.documentElement.dataset.theme;
    theme.value = isTheme(current) ? current : 'light';
    hasManualChoice = readStoredTheme() !== null;
    applyThemeColor();
}

function setTheme(value: Theme): void {
    theme.value = value;
    applyTheme(value);
}

/**
 * Tema claro u oscuro. Sin elección del usuario sigue al sistema
 * (prefers-color-scheme); al alternar, la elección queda en el dispositivo
 * y se sincroniza entre pestañas.
 */
export function useTheme() {
    initialize();

    const onSystemChange = (event: MediaQueryListEvent): void => {
        if (!hasManualChoice) {
            setTheme(event.matches ? 'dark' : 'light');
        }
    };

    // Otra pestaña cambió (o borró) la preferencia guardada.
    const onStorage = (event: StorageEvent): void => {
        if (event.key !== null && event.key !== THEME_STORAGE_KEY) {
            return;
        }

        // Un valor desconocido no es una elección ni un borrado: se ignora
        // para no perder la elección manual de esta pestaña.
        if (event.newValue !== null && !isTheme(event.newValue)) {
            return;
        }

        const stored = event.newValue;
        hasManualChoice = stored !== null;
        setTheme(stored ?? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'));
    };

    let media: MediaQueryList | null = null;

    onMounted(() => {
        media = window.matchMedia(DARK_QUERY);
        media.addEventListener('change', onSystemChange);
        window.addEventListener('storage', onStorage);
    });

    onBeforeUnmount(() => {
        media?.removeEventListener('change', onSystemChange);
        window.removeEventListener('storage', onStorage);
    });

    function toggleTheme(): void {
        hasManualChoice = true;
        setTheme(theme.value === 'dark' ? 'light' : 'dark');

        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme.value);
        } catch {
            // Sin almacenamiento el cambio vale solo para esta visita.
        }
    }

    return {
        theme: readonly(theme),
        isDark: computed(() => theme.value === 'dark'),
        toggleTheme,
    };
}
