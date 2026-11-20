import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { useI18n } from '@/composables/useI18n';

import type { Restaurant } from './api';
import { fetchRestaurants } from './api';

/** `loading`: todavía no hay lista. `error`: no llegó (hay «Reintentar»). `ready`: llegó, quizá vacía. */
export type RestaurantsStatus = 'loading' | 'ready' | 'error';

/** La copia guardada en el teléfono: baja aparte, al llegar una lista o cuando hace falta la última (#144). Un solo import(): cada uno pesa en el arranque; sin señal puede no bajar (null). */
const saved = () => import('./savedList').catch(() => null);

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
 *
 * Sin señal y sin lista a la vista, se usa la última que llegó a este
 * teléfono (#144, ADR 0046): `staleSince` dice cuándo llegó, y la interfaz
 * avisa «Sin señal: datos de hace …». Cada lista que llega se guarda. Ese
 * módulo baja aparte (import()): no pesa en el arranque.
 */
export function useRestaurants() {
    const { locale } = useI18n();

    const status = ref<RestaurantsStatus>('loading');
    const restaurants = shallowRef<Restaurant[]>([]);
    /** Cuándo llegó la lista guardada que se muestra porque no hay señal (ms), o null si la lista es de ahora. */
    const staleSince = ref<number | null>(null);
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

        // El idioma en que se pide: el de la lista que llegue, aunque la interfaz cambie después.
        const asked = locale.value;

        try {
            const list = await fetchRestaurants(asked, current.signal);

            if (current.signal.aborted) {
                return;
            }

            restaurants.value = list;
            status.value = 'ready';
            staleSince.value = null;
            loadedAt = Date.now();
            void saved().then((module) => module?.saveList(asked, list));
        } catch (error) {
            // Abortado: el componente ya no está o salió otro pedido.
            if (current.signal.aborted) {
                return;
            }

            console.error('[restaurantes] No se pudieron cargar los restaurantes.', error);

            if (status.value !== 'ready') {
                // Sin lista a la vista: la guardada, con su hora, o el error.
                const last = await saved().then((module) => module?.savedIn(locale.value));

                if (request === current) {
                    restaurants.value = last?.restaurants ?? [];
                    staleSince.value = loadedAt = last?.savedAt ?? null;
                    status.value = last ? 'ready' : 'error';
                }
            }
        }
    }

    // Con la lista ya a la vista, load() no pasa por «cargando»: llega la nueva o queda la que había.
    // La guardada (sin señal) cuenta desde que llegó, y se vuelve a intentar al volver la pestaña pasado el minuto.
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
        staleSince,
        /** Vuelve a pedir la lista (el botón «Reintentar»). */
        retry: (): void => {
            void load();
        },
    };
}
