import type { Locale } from '@/composables/useI18n';
import type { Theme } from '@/composables/useTheme';

import { MapUnavailableError } from './errors';
import { missingStylePlaceholders } from './styleTemplate';

/** Nombre de cada tema en los estilos de veni-mapa: `veni-{claro,oscuro}-{es,en}.json`. */
const STYLE_THEMES: Readonly<Record<Theme, string>> = { light: 'claro', dark: 'oscuro' };

/**
 * URL del estilo del mapa para un tema y un idioma (ADR 0007). `template` es
 * `VITE_MAP_STYLE_URL`: una plantilla donde `{theme}` se cambia por `claro` u
 * `oscuro` y `{locale}` por `es` o `en`. Ejemplo:
 *
 *     https://tiles.veniroldanillo.co/vX.Y.Z/veni-{theme}-{locale}.json
 *
 * Sin algún marcador el mapa se queda en un solo tema o un solo idioma: en
 * desarrollo se avisa en la consola, y `vite build` se niega a compilar
 * (vite.config.ts). Sin plantilla lanza un error: quien pinta el mapa lo
 * muestra como no disponible.
 */
export function mapStyleUrl(template: string | undefined, theme: Theme, locale: Locale): string {
    if (template === undefined || template.trim() === '') {
        throw new MapUnavailableError('Falta VITE_MAP_STYLE_URL: el mapa no tiene estilo que cargar.');
    }

    if (import.meta.env.DEV) {
        const missing = missingStylePlaceholders(template);

        if (missing.length > 0) {
            console.warn(
                `[mapa] VITE_MAP_STYLE_URL no trae ${missing.join(' ni ')}: el mapa no sigue al tema ni al idioma. ` +
                    'Es una plantilla, …/veni-{theme}-{locale}.json: corregila en el .env (ver .env.example) y reiniciá npm run dev.',
            );
        }
    }

    return template.trim().replaceAll('{theme}', STYLE_THEMES[theme]).replaceAll('{locale}', locale);
}
