import type { Locale } from '@/composables/useI18n';

import type { Restaurant } from './api';

/**
 * La última lista de restaurantes que llegó, guardada en el teléfono (#144,
 * ADR 0046): lo único que se puede mostrar sin señal, porque el HTML no se
 * guarda nunca (ADR 0015). Son datos públicos de los restaurantes, los mismos
 * de /api/restaurants.geojson: nunca la ubicación de la persona ni nada suyo
 * (reglas de producto 2 y 3).
 *
 * Es una copia que envejece: va con la hora en que llegó, la interfaz dice de
 * hace cuánto es («Sin señal: datos de hace 2 horas») y pasados 14 días ya no
 * se usa (un restaurante que se ocultó o se cerró no debe seguir a la vista
 * para siempre). Una lista nueva la reemplaza; si el servidor responde que no
 * hay ninguno, se borra.
 *
 * La página sin conexión (resources/js/offline.ts) lee la misma clave, con su
 * propia copia del nombre: es un script clásico y no puede importar.
 */
export const SAVED_KEY = 'veni:restaurants';

/** Lo que dura la copia: pasado, es mejor no mostrar nada que datos de hace semanas. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Lo que más pesa lo guardado (caracteres): un pueblo entero cabe en una décima parte. */
const MAX_LENGTH = 400_000;

export interface SavedList {
    /** Cuándo llegó, por el reloj del dispositivo (ms). */
    savedAt: number;
    /** El idioma en que vinieron las categorías. */
    locale: Locale;
    restaurants: Restaurant[];
}

/**
 * Lo que se guardó se escribió con la forma de `Restaurant` (la versión 1 de la
 * copia): se piden los campos sin los que el mapa y la lista fallarían, y una
 * versión distinta ya se descartó antes por `version`.
 */
function isRestaurant(value: unknown): value is Restaurant {
    if (typeof value !== 'object' || value === null || !('slug' in value) || !('name' in value) || !('coordinates' in value)) {
        return false;
    }

    const { slug, name, coordinates } = value;

    return (
        typeof slug === 'string' &&
        typeof name === 'string' &&
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        coordinates.every((degrees) => Number.isFinite(degrees)) &&
        'categories' in value &&
        Array.isArray(value.categories) &&
        'hours' in value &&
        Array.isArray(value.hours) &&
        'special_hours' in value &&
        Array.isArray(value.special_hours)
    );
}

/** Quita la copia: una que ya no se puede reemplazar es peor que ninguna (mostraría datos viejos como si fueran los de ahora). */
function discard(): void {
    try {
        window.localStorage.removeItem(SAVED_KEY);
    } catch {
        // Bloqueado: no hay nada más que hacer.
    }
}

/** Guarda la lista que acaba de llegar; false si no se pudo (sin espacio, almacenamiento bloqueado), y entonces la copia anterior se borra. Vacía, también la borra. */
export function saveList(locale: Locale, restaurants: readonly Restaurant[], now: number = Date.now()): boolean {
    if (restaurants.length === 0) {
        discard();

        return true;
    }

    try {
        const json = JSON.stringify({ version: 1, savedAt: now, locale, restaurants });

        if (json.length <= MAX_LENGTH) {
            window.localStorage.setItem(SAVED_KEY, json);

            return true;
        }
    } catch {
        // Sin espacio o bloqueado: cae a borrar la anterior.
    }

    discard();

    return false;
}

/** La lista guardada, o null si no hay, está vencida o no tiene la forma (otra versión, un dato roto). */
export function loadSaved(now: number = Date.now()): SavedList | null {
    try {
        const raw = window.localStorage.getItem(SAVED_KEY);

        if (raw === null) {
            return null;
        }

        const body: unknown = JSON.parse(raw);

        if (typeof body !== 'object' || body === null || !('version' in body) || body.version !== 1 || !('savedAt' in body) || typeof body.savedAt !== 'number' || !('restaurants' in body) || !Array.isArray(body.restaurants) || !('locale' in body)) {
            return null;
        }

        if (body.locale !== 'es' && body.locale !== 'en') {
            return null;
        }

        // Una hora del futuro (el reloj se movió) no es de hace nada: se descarta.
        if (body.savedAt > now || now - body.savedAt > MAX_AGE_MS) {
            return null;
        }

        const restaurants = body.restaurants.filter(isRestaurant);

        return restaurants.length === 0 ? null : { savedAt: body.savedAt, locale: body.locale, restaurants };
    } catch {
        return null;
    }
}

/**
 * La copia para una interfaz en `locale`. Las categorías y el almuerzo vienen
 * en el idioma en que se guardó: si es otro, se quitan (la lista y el mapa
 * siguen sirviendo) en vez de mostrarlos como si fueran de este idioma.
 */
export function savedIn(locale: Locale, now: number = Date.now()): SavedList | null {
    const saved = loadSaved(now);

    return saved === null || saved.locale === locale ? saved : { ...saved, restaurants: saved.restaurants.map((restaurant) => ({ ...restaurant, categories: [], lunch: null })) };
}

/** De hace cuánto es la copia, en palabras del idioma: «hace 2 horas», «2 hours ago». Siempre al menos un minuto. */
export function agoText(savedAt: number, now: number, locale: Locale): string {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const minutes = Math.max(1, Math.round((now - savedAt) / 60_000));

    if (minutes < 60) {
        return rtf.format(-minutes, 'minute');
    }

    const hours = Math.round(minutes / 60);

    return hours < 24 ? rtf.format(-hours, 'hour') : rtf.format(-Math.round(hours / 24), 'day');
}
