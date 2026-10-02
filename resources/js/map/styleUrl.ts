import type { Locale } from '@/composables/useI18n';
import type { Theme } from '@/composables/useTheme';

/** Nombre de cada tema en los estilos de veni-mapa: `veni-{claro,oscuro}-{es,en}.json`. */
const STYLE_THEMES: Readonly<Record<Theme, string>> = { light: 'claro', dark: 'oscuro' };

/**
 * URL del estilo del mapa para un tema y un idioma (ADR 0007). `template` es
 * `VITE_MAP_STYLE_URL`: una plantilla donde `{theme}` se cambia por `claro` u
 * `oscuro` y `{locale}` por `es` o `en`. Ejemplo:
 *
 *     https://tiles.veniroldanillo.co/vX.Y.Z/veni-{theme}-{locale}.json
 *
 * Sin marcadores vale como un estilo fijo: el mapa no acompaña al tema ni al
 * idioma, y en desarrollo se avisa en la consola. Sin plantilla lanza un
 * error: quien pinta el mapa lo muestra como «no se pudo cargar».
 */
export function mapStyleUrl(template: string | undefined, theme: Theme, locale: Locale): string {
    if (template === undefined || template.trim() === '') {
        throw new Error('Falta VITE_MAP_STYLE_URL: el mapa no tiene estilo que cargar.');
    }

    if (import.meta.env.DEV && !(template.includes('{theme}') && template.includes('{locale}'))) {
        console.warn('[mapa] VITE_MAP_STYLE_URL no trae {theme} y {locale}: el mapa no cambia con el tema ni el idioma.');
    }

    return template.trim().replaceAll('{theme}', STYLE_THEMES[theme]).replaceAll('{locale}', locale);
}
