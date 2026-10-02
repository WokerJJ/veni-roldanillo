/**
 * Marcadores que debe traer `VITE_MAP_STYLE_URL` (ADR 0007). Sin imports: lo
 * usan la app (resources/js/map/styleUrl.ts) y vite.config.ts, que corre en Node.
 */
const STYLE_PLACEHOLDERS = ['{theme}', '{locale}'] as const;

/**
 * Los marcadores que le faltan a la plantilla del estilo. Con alguno de menos
 * el mapa se queda en un solo tema o un solo idioma, sin que nada falle.
 */
export function missingStylePlaceholders(template: string): string[] {
    return STYLE_PLACEHOLDERS.filter((placeholder) => !template.includes(placeholder));
}
