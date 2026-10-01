/** Textos de un idioma: clave → texto (lang/{idioma}.json). */
export type Translations = Readonly<Record<string, string>>;

/** Valores para los marcadores `:nombre` de un texto. */
export type Replacements = Readonly<Record<string, string | number>>;

function upperFirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Igual que __() de Laravel, para que un mismo texto sirva en los dos lados:
 * reemplaza `:nombre`, `:Nombre` (primera letra en mayúscula) y `:NOMBRE`
 * (todo en mayúsculas) en una sola pasada, probando primero los marcadores
 * más largos. Si la clave no existe devuelve la clave, que se nota a simple
 * vista (las pruebas de lang/ evitan que llegue a producción).
 */
export function translate(translations: Translations, key: string, replacements: Replacements = {}): string {
    const line = Object.hasOwn(translations, key) ? (translations[key] ?? key) : key;
    const values = new Map<string, string>();

    for (const [name, raw] of Object.entries(replacements)) {
        const value = String(raw);
        values.set(`:${upperFirst(name)}`, upperFirst(value));
        values.set(`:${name.toUpperCase()}`, value.toUpperCase());
        values.set(`:${name}`, value);
    }

    if (values.size === 0) {
        return line;
    }

    const placeholders = [...values.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);

    return line.replace(new RegExp(placeholders.join('|'), 'g'), (match) => values.get(match) ?? match);
}
