import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { useI18n } from '@/composables/useI18n';

import type { Restaurant } from './api';
import { fetchRestaurants } from './api';

/** `loading`: todavía no hay lista. `error`: no llegó (hay «Reintentar»). `ready`: llegó, quizá vacía. */
export type RestaurantsStatus = 'loading' | 'ready' | 'error';

/** Lo que dura la lista: el minuto que el servidor deja guardarla (ADR 0017). */
const FRESH_FOR_MS = 60_000;

/**
 * Los restaurantes publicados, para el mapa del inicio. Los pide al montar,
 * otra vez cuando cambia el idioma de la interfaz (los nombres de las
 * categorías vienen en ese idioma) y cuando la pestaña vuelve del fondo con
 * una lista de más de un minuto: una app instalada pasa horas abierta sin
 * volver a montarse, y una ficha que se ocultó tiene que dejar de verse.
 *
 * Si ya hay una lista a la vista y el pedido nuevo falla, se queda la que
 * estaba: vale más una categoría en el idioma anterior, o un horario de hace
 * un rato, que un mapa sin restaurantes.
 */
export function useRestaurants() {
    const { locale } = useI18n();

    const status = ref<RestaurantsStatus>('loading');
    const restaurants = shallowRef<Restaurant[]>([]);
    /** El pedido en curso: al abortarlo, su respuesta ya no cuenta. */
    let request: AbortController | null = null;
    /** Cuándo llegó la lista que se ve, por el reloj del dispositivo. */
    let loadedAt: number | null = null;

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
            loadedAt = Date.now();
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

    // Con la lista ya a la vista, load() no pasa por «cargando»: llega la nueva o queda la que había.
    const onVisible = (): void => {
        if (document.visibilityState === 'visible' && loadedAt !== null && Date.now() - loadedAt > FRESH_FOR_MS) {
            void load();
        }
    };

    watch(locale, () => void load(), { immediate: true });

    onMounted(() => {
        document.addEventListener('visibilitychange', onVisible);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('visibilitychange', onVisible);
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
