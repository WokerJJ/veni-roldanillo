import type { ComputedRef, Ref } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { useI18n } from '@/composables/useI18n';

import type { Restaurant } from './api';
import type { Filters } from './filterParams';
import { hasFilters } from './filterParams';
import type { LunchOfTheDay } from './finder';
import { filterRestaurants, pickSuggestion, todaysLunches, withoutUnknownCategory } from './finder';

/*
| Lo que comparten la bienvenida (WelcomeActions.vue), la lista
| (RestaurantList.vue) y la capa del mapa (RestaurantsLayer.vue) al buscar y
| filtrar (#12, ADR 0028): cuáles cumplen los filtros, «Sugerime algo» y lo
| que anuncia la región de estado. Baja con la lista, fuera del arranque.
*/

/** Cada cuánto se pone al día la hora: «abierto ahora» cambia con el reloj. */
const TICK_MS = 30_000;

/** Un solo reloj para todos los que filtran: así la capa, la lista y la bienvenida dicen lo mismo en el mismo instante. */
const sharedNow = shallowRef(new Date());
let clockUsers = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

function tick(): void {
    sharedNow.value = new Date();
}

function onVisible(): void {
    if (document.visibilityState === 'visible') {
        tick();
    }
}

/** La hora compartida, que corre mientras viva alguno de los que la usan (y al volver la pestaña del fondo). */
function useSharedNow(): Readonly<Ref<Date>> {
    onMounted(() => {
        tick();

        if (clockUsers++ === 0) {
            clockTimer = setInterval(tick, TICK_MS);
            document.addEventListener('visibilitychange', onVisible);
        }
    });

    onBeforeUnmount(() => {
        if (--clockUsers === 0) {
            clearInterval(clockTimer);
            document.removeEventListener('visibilitychange', onVisible);
        }
    });

    return sharedNow;
}

export interface FinderSource {
    /** Todos los del mapa. */
    restaurants: () => readonly Restaurant[];
    /** La búsqueda y los filtros; null mientras el inicio no los leyó de la dirección. */
    filters: () => Readonly<Filters> | null;
}

export interface Finder {
    now: Readonly<Ref<Date>>;
    /** ¿Hay algún filtro puesto? */
    filtered: ComputedRef<boolean>;
    /** Los que cumplen los filtros, en el orden en que llegaron. */
    matching: ComputedRef<readonly Restaurant[]>;
}

/** Los que cumplen los filtros, con la hora compartida. La hora solo cuenta con «abierto ahora». */
export function useFinder(source: FinderSource): Finder {
    const now = useSharedNow();
    const filtered = computed(() => {
        const filters = source.filters();

        return filters !== null && hasFilters(filters);
    });
    const matching = computed(() => {
        const filters = source.filters();
        const restaurants = source.restaurants();

        return filters === null || !filtered.value ? restaurants : filterRestaurants(restaurants, filters, filters.open ? now.value : new Date());
    });

    return { now, filtered, matching };
}

/** Lo que tarda en anunciarse un cambio del buscador: no se anuncia cada tecla (WCAG 4.1.3). */
export const ANNOUNCE_DELAY_MS = 500;

export interface FinderPanelOptions {
    /** Sin filtros, la lista dice cuántos hay; la bienvenida, nada. */
    unfiltered: 'count' | 'silent';
    /** Filtros corregidos: una categoría que ningún restaurante tiene se descarta. */
    onFilters: (filters: Filters) => void;
}

export interface FinderPanel extends Finder {
    /** Los almuerzos de hoy de los que cumplen los filtros. */
    lunches: ComputedRef<LunchOfTheDay[]>;
    /** Lo que dice ahora la región de estado: cuántos quedan, o que no hay abiertos para sugerir. */
    message: ComputedRef<string>;
    /** Lo que la región de estado anuncia: el mensaje, medio segundo después de dejar de teclear. */
    announced: Readonly<Ref<string>>;
    /** «Sugerime algo»: el slug de uno de los abiertos que cumplen los filtros (no el último), o null si no hay. */
    suggest: () => string | null;
}

/** Lo de la lista y la bienvenida: además de filtrar, los almuerzos, «Sugerime algo» y la región de estado. */
export function useFinderPanel(source: FinderSource, { unfiltered, onFilters }: FinderPanelOptions): FinderPanel {
    const { t } = useI18n();
    const finder = useFinder(source);
    const { now, filtered, matching } = finder;
    const lunches = computed(() => todaysLunches(matching.value, now.value));
    /** «Sugerime algo» no encontró ningún abierto: se dice hasta que cambien los filtros. */
    const missed = ref(false);
    /** El último sugerido: otra vez no lo repite si hay otro abierto. */
    let lastSuggestion: string | null = null;

    // Una categoría que ninguno tiene (un enlace viejo) dejaría la lista y el
    // mapa vacíos sin que el selector la ofrezca para sacarla: se descarta
    // apenas está la lista.
    watch(
        () => {
            const filters = source.filters();

            return filters === null ? null : withoutUnknownCategory(filters, source.restaurants());
        },
        (fixed) => {
            if (fixed !== null) {
                onFilters(fixed);
            }
        },
        { immediate: true },
    );

    watch(source.filters, () => {
        missed.value = false;
    });

    const message = computed(() => {
        const total = source.restaurants().length;

        if (missed.value) {
            return filtered.value ? t('finder.suggest_none_filtered') : t('finder.suggest_none');
        }

        if (!filtered.value) {
            if (unfiltered === 'silent') {
                return '';
            }

            return total === 1 ? t('restaurants.count_one') : t('restaurants.count_many', { count: total });
        }

        return matching.value.length === 0 ? t('finder.none') : t('finder.count_filtered', { count: matching.value.length, total });
    });

    // Al teclear, el anuncio espera a que se deje de escribir; lo demás
    // (una casilla, un selector, «Sugerime algo») se anuncia enseguida.
    const announced = ref(message.value);
    let announceTimer: ReturnType<typeof setTimeout> | undefined;

    watch([message, () => source.filters()?.query ?? ''], ([text, query], [, previousQuery]) => {
        clearTimeout(announceTimer);

        if (query !== previousQuery) {
            announceTimer = setTimeout(() => {
                announced.value = text;
            }, ANNOUNCE_DELAY_MS);
        } else {
            announced.value = text;
        }
    });

    onBeforeUnmount(() => {
        clearTimeout(announceTimer);
    });

    function suggest(): string | null {
        const pick = pickSuggestion(matching.value, now.value, Math.random, lastSuggestion);

        if (pick === null) {
            if (missed.value) {
                // Falló otra vez: el texto no cambia y el lector no lo repetiría. Se vacía y se vuelve a escribir.
                announced.value = '';
                void nextTick(() => {
                    announced.value = message.value;
                });
            }

            missed.value = true;

            return null;
        }

        missed.value = false;
        lastSuggestion = pick.slug;

        return pick.slug;
    }

    return { ...finder, lunches, message, announced, suggest };
}
