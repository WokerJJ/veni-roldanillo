import type { Ref } from 'vue';
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import type { Locale } from '@/composables/useI18n';

import type { DishGroup } from './dishSearch';
import { dishQuery, DishSearchUnavailable, fetchDishes } from './dishSearch';

/** Lo que se espera después de la última tecla antes de preguntar al servidor. */
export const DISH_SEARCH_DEBOUNCE_MS = 350;

/**
 * - `idle`: no hay consulta (menos de tres letras).
 * - `loading`: esperando la respuesta (o la pausa al teclear).
 * - `done`: llegó (puede ser sin resultados).
 * - `offline`: sin señal; no se preguntó.
 * - `unavailable`: el servidor dice que la búsqueda de platos no anda (503).
 * - `error`: cualquier otra falla (red, plazo, respuesta que no sirve).
 */
export type DishSearchStatus = 'idle' | 'loading' | 'done' | 'offline' | 'unavailable' | 'error';

export interface DishSearchState {
    status: Readonly<Ref<DishSearchStatus>>;
    /** Lo último que llegó, de la consulta `searched`. */
    results: Readonly<Ref<readonly DishGroup[]>>;
    /** La consulta de `results`, ya limpia. */
    searched: Readonly<Ref<string>>;
    /** Vuelve a preguntar por la consulta de ahora (el botón «Reintentar»). */
    retry: () => void;
}

/**
 * La búsqueda por plato del inicio (#17, ADR 0029): pregunta al servidor
 * DISH_SEARCH_DEBOUNCE_MS después de la última tecla, solo con tres letras o
 * más, y cancela la petición anterior si se sigue tecleando (una respuesta
 * vieja nunca pisa a una nueva). Sin señal no pregunta.
 */
export function useDishSearch(query: () => string, locale: () => Locale): DishSearchState {
    const status = ref<DishSearchStatus>('idle');
    const results = shallowRef<readonly DishGroup[]>([]);
    const searched = ref('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: AbortController | null = null;

    function cancel(): void {
        clearTimeout(timer);
        pending?.abort();
        pending = null;
    }

    async function run(text: string, lang: Locale): Promise<void> {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            status.value = 'offline';

            return;
        }

        const controller = new AbortController();
        pending = controller;

        try {
            const groups = await fetchDishes(text, lang, controller.signal);

            if (pending === controller) {
                results.value = groups;
                searched.value = text;
                status.value = 'done';
            }
        } catch (error) {
            if (pending === controller) {
                status.value = error instanceof DishSearchUnavailable ? 'unavailable' : 'error';
            }
        } finally {
            if (pending === controller) {
                pending = null;
            }
        }
    }

    function schedule(delay: number): void {
        cancel();

        const text = dishQuery(query());

        if (text === null) {
            status.value = 'idle';
            results.value = [];
            searched.value = '';

            return;
        }

        const lang = locale();

        status.value = 'loading';
        timer = setTimeout(() => void run(text, lang), delay);
    }

    // Solo cuando cambia lo que se mandaría (un espacio de más no pregunta
    // otra vez) o el idioma.
    watch([() => dishQuery(query()), locale], () => {
        schedule(DISH_SEARCH_DEBOUNCE_MS);
    }, { immediate: true });

    onBeforeUnmount(cancel);

    return {
        status,
        results,
        searched,
        retry: () => {
            schedule(0);
        },
    };
}
