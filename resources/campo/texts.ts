/*
| Los textos de /campo (ADR 0048). Llegan en el HTML del shell, dentro de un
| bloque JSON con los dos idiomas (resources/views/campo.blade.php, desde
| lang/{es,en}/campo.php): así la herramienta abre sin señal y no engorda
| lang/{es,en}.json, que viaja entero al navegador en cada página.
*/

export type CampoLocale = 'es' | 'en';

type Texts = Readonly<Record<string, unknown>>;

const STORAGE_KEY = 'veni:campo-locale';

let dictionary: Readonly<Record<CampoLocale, Texts>> = { es: {}, en: {} };
let locale: CampoLocale = 'es';

/** Lee el bloque JSON del shell. Sin él (o roto), los textos salen como su clave. */
export function loadTexts(source: Document = document): void {
    const block = source.getElementById('campo-texts');

    if (block?.textContent) {
        try {
            dictionary = JSON.parse(block.textContent) as Readonly<Record<CampoLocale, Texts>>;
        } catch {
            dictionary = { es: {}, en: {} };
        }
    }

    locale = chooseLocale();
}

function chooseLocale(): CampoLocale {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved === 'es' || saved === 'en') {
            return saved;
        }
    } catch {
        // Sin almacenamiento: se decide por el idioma del teléfono.
    }

    return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function currentLocale(): CampoLocale {
    return locale;
}

export function setLocale(next: CampoLocale): void {
    locale = next;

    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // Sin almacenamiento: vale hasta cerrar la pantalla.
    }
}

function lookup(key: string): unknown {
    let node: unknown = dictionary[locale];

    for (const part of key.split('.')) {
        if (typeof node !== 'object' || node === null) {
            return undefined;
        }

        node = (node as Record<string, unknown>)[part];
    }

    return node;
}

/** Un texto con sus `:marcadores` reemplazados. Si falta, la clave: se nota en pantalla y en las pruebas. */
export function t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    const value = lookup(key);

    if (typeof value !== 'string') {
        return key;
    }

    return value.replace(/:([a-z_]+)/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Una lista de textos (los días de la semana). */
export function list(key: string): string[] {
    const value = lookup(key);

    return Array.isArray(value) ? value.map(String) : [];
}
