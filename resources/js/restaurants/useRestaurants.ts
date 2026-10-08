import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import { useI18n } from '@/composables/useI18n';

import type { Restaurant } from './api';
import { fetchRestaurants } from './api';

/** `loading`: todavía no hay lista. `error`: no llegó (hay «Reintentar»). `ready`: llegó, quizá vacía. */
export type RestaurantsStatus = 'loading' | 'ready' | 'error';

/**
 * Los restaurantes publicados, para el mapa del inicio. Los pide al montar y
 * otra vez cuando cambia el idioma de la interfaz (los nombres de las
 * categorías vienen en ese idioma).
 *
 * Si ya hay una lista a la vista y el pedido del otro idioma falla, se queda
 * la que estaba: vale más una categoría en el idioma anterior que un mapa sin
 * restaurantes.
 */
export function useRestaurants() {
    const { locale } = useI18n();

    const status = ref<RestaurantsStatus>('loading');
    const restaurants = shallowRef<Restaurant[]>([]);
    /** El pedido en curso: al abortarlo, su respuesta ya no cuenta. */
    let request: AbortController | null = null;

    async function load(): Promise<void> {
        request?.abort();
        const current = new AbortController();
        request = current;

        if (status.value !== 'ready') {
            status.value = 'loading';
        }

        try {
            const list = await fetchRestaurants(locale.value, current.signal);

            if (current.signal.aborted) {
                return;
            }

            restaurants.value = list;
            status.value = 'ready';
        } catch (error) {
            // Abortado: el componente ya no está o salió otro pedido.
            if (current.signal.aborted) {
                return;
            }

            console.error('[restaurantes] No se pudieron cargar los restaurantes.', error);

            if (status.value !== 'ready') {
                status.value = 'error';
            }
        }
    }

    watch(locale, () => void load(), { immediate: true });

    onBeforeUnmount(() => {
        request?.abort();
        request = null;
    });

    return {
        status,
        restaurants,
        /** Vuelve a pedir la lista (el botón «Reintentar»). */
        retry: (): void => {
            void load();
        },
    };
}
