import { computed, onBeforeUnmount, onMounted, readonly, ref } from 'vue';

export type Theme = 'light' | 'dark';

/** Clave en localStorage; la misma que lee el script inline de app.blade.php. */
export const THEME_STORAGE_KEY = 'veni:theme';

const darkQuery = '(prefers-color-scheme: dark)';

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

function systemTheme(): Theme {
    return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
}

const theme = ref<Theme>(readStoredTheme() ?? systemTheme());

/**
 * Tema claro u oscuro. Sin preferencia guardada sigue al sistema
 * (prefers-color-scheme); al alternar, la elección queda en el dispositivo.
 */
export function useTheme() {
    const media = window.matchMedia(darkQuery);

    const onSystemChange = (event: MediaQueryListEvent): void => {
        if (readStoredTheme() === null) {
            theme.value = event.matches ? 'dark' : 'light';
            applyTheme(theme.value);
        }
    };

    onMounted(() => {
        applyTheme(theme.value);
        media.addEventListener('change', onSystemChange);
    });

    onBeforeUnmount(() => {
        media.removeEventListener('change', onSystemChange);
    });

    function toggleTheme(): void {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
        applyTheme(theme.value);

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
