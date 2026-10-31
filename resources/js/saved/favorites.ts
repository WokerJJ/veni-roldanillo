import { computed, type ComputedRef, shallowRef } from 'vue';

import { isRecord, readItem, writeItem } from '@/device/localStore';

/**
 * Los restaurantes favoritos (#16, ADR 0032), en este teléfono: solo el slug
 * de cada uno, del último marcado al primero, en `localStorage`
 * (`veni:favorites`) con versión. Nunca salen del teléfono: aquí no hay ni
 * una petición, y el servidor no sabe quién marcó qué.
 *
 * Como solo es el slug, el nombre y lo demás salen de la lista del mapa: un
 * favorito que ya no está (se ocultó o se retiró) no aparece y no rompe nada;
 * si vuelve, vuelve como favorito. Hasta 100, con slugs de hasta 140
 * caracteres como los del servidor.
 */

export const FAVORITES_KEY = 'veni:favorites';
export const MAX_FAVORITES = 100;
/** La forma de un slug de Laravel (Str::slug): minúsculas, números y guiones. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** El largo de la columna `restaurants.slug`. */
const SLUG_MAX_LENGTH = 140;
/** Lo más que se lee: los 100 favoritos con el slug más largo, entre comillas y comas. */
const MAX_RAW_LENGTH = MAX_FAVORITES * (SLUG_MAX_LENGTH + 3) + 20;

interface Stored {
    v: 1;
    data: string[];
}

export function isSlug(value: unknown): value is string {
    return typeof value === 'string' && value.length <= SLUG_MAX_LENGTH && SLUG.test(value);
}

/** Los favoritos guardados, sin repetidos ni lo que no es un slug. */
export function parseFavorites(raw: string | null): string[] {
    if (raw === null || raw.length > MAX_RAW_LENGTH) {
        return [];
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!isRecord(parsed) || parsed.v !== 1 || !Array.isArray(parsed.data)) {
        return [];
    }

    return [...new Set(parsed.data.filter(isSlug))].slice(0, MAX_FAVORITES);
}

const favorites = shallowRef<readonly string[]>([]);
let loaded = false;
let listening = false;

function persist(next: readonly string[]): void {
    favorites.value = next;

    const stored: Stored = { v: 1, data: [...next] };
    writeItem(FAVORITES_KEY, next.length === 0 ? null : JSON.stringify(stored));
}

function onStorage(event: StorageEvent): void {
    if (event.key === FAVORITES_KEY || event.key === null) {
        favorites.value = parseFavorites(event.newValue);
    }
}

function ensureLoaded(): void {
    if (!loaded) {
        loaded = true;
        favorites.value = parseFavorites(readItem(FAVORITES_KEY));
    }

    if (!listening && typeof window !== 'undefined') {
        listening = true;
        window.addEventListener('storage', onStorage);
    }
}

export interface Favorites {
    /** Del último marcado al primero. */
    slugs: ComputedRef<readonly string[]>;
    has: (slug: string) => boolean;
    /** Marca o desmarca; devuelve si quedó marcado. Con 100 ya marcados, no marca otro. */
    toggle: (slug: string) => boolean;
    remove: (slug: string) => void;
    clear: () => void;
}

export function useFavorites(): Favorites {
    ensureLoaded();

    const has = (slug: string): boolean => favorites.value.includes(slug);

    return {
        slugs: computed(() => favorites.value),
        has,
        toggle: (slug) => {
            if (has(slug)) {
                persist(favorites.value.filter((saved) => saved !== slug));

                return false;
            }

            if (!isSlug(slug) || favorites.value.length >= MAX_FAVORITES) {
                return false;
            }

            persist([slug, ...favorites.value]);

            return true;
        },
        remove: (slug) => {
            persist(favorites.value.filter((saved) => saved !== slug));
        },
        clear: () => {
            persist([]);
        },
    };
}

/** Solo para las pruebas: empezar con los favoritos sin leer. */
export function resetFavorites(): void {
    favorites.value = [];
    loaded = false;
}
