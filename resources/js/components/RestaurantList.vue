<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { computed, onMounted, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import RestaurantFilters from '@/components/RestaurantFilters.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import TodaysLunches from '@/components/TodaysLunches.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { hasFilters, NO_FILTERS } from '@/restaurants/filterParams';
import { categoriesOf, filterRestaurants, pickSuggestion, todaysLunches } from '@/restaurants/finder';
import { restaurantUrl } from '@/restaurants/links';
import { openStatus } from '@/restaurants/openStatus';
import { openStatusText } from '@/restaurants/statusText';
import { formatDistance } from '@/routing/directions';

/**
 * Los restaurantes del mapa como lista (#9): la alternativa al mapa para quien
 * usa teclado o lector de pantalla (los marcadores se dibujan en un lienzo y
 * no se pueden recorrer), y para quien prefiere leer. Cada uno es un botón
 * con su nombre y su estado, que abre el mismo resumen que tocar su marcador.
 * Al lado, un enlace lleva derecho a su ficha (#13), sin pasar por el resumen.
 *
 * Compacta (#81): primero los abiertos ahora y, si «¿Dónde estoy?» está
 * encendido, los más cercanos, con la distancia en la línea del estado
 * (`distances`, calculadas en el dispositivo: RestaurantDistances.vue). Si
 * todos son de ejemplo, lo dice una vez arriba; si solo algunos, cada uno.
 * El orden se fija al abrirla y, con «¿Dónde estoy?», con la primera
 * distancia: mientras está abierta nada cambia de lugar bajo el dedo (quien
 * camina, o uno que abre o cierra); solo el texto de la distancia.
 *
 * Con el buscador y los filtros (#12): muestra los que cumplen `filters`
 * (los mismos que dibuja la capa del mapa, RestaurantsLayer.vue); de todos
 * salen las categorías que se pueden elegir, el total y el orden, así un
 * filtro saca filas pero no reordena las que quedan. Arriba, «Sugerime algo» (uno al azar
 * entre los abiertos que cumplen los filtros: lo elige como si lo hubieran
 * tocado) y «Almuerzos de hoy»; cuántos quedan se anuncia en una región de
 * estado. Los filtros no se aplican aquí: se emiten (`update:filters`) y
 * Home.vue los aplica a la lista y al mapa a la vez.
 *
 * Al abrirse toma el foco en el título (o en «Almuerzos de hoy», con
 * `start`); quien la muestra la cierra con
 * `close` (el botón o Escape) y, al volver de un resumen, devuelve el foco al
 * botón de ese restaurante con `focusItem`.
 */
const {
    restaurants: all,
    filters: given = null,
    start = 'heading',
    distances = null,
} = defineProps<{
    /** Todos los del mapa. */
    restaurants: readonly Restaurant[];
    /** La búsqueda y los filtros; null mientras el inicio no los leyó de la dirección. */
    filters?: Readonly<Filters> | null;
    /** Dónde queda el foco al abrir: el título o «Almuerzos de hoy». */
    start?: 'heading' | 'lunches';
    /** Metros hasta cada restaurante, por slug, o null sin ubicación. */
    distances?: Readonly<Record<string, number>> | null;
}>();

const emit = defineEmits<{
    select: [slug: string];
    close: [];
    'update:filters': [filters: Filters];
}>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');
const list = useTemplateRef<HTMLElement>('list');

const filters = computed(() => given ?? NO_FILTERS);
const filtered = computed(() => hasFilters(filters.value));
/** Los que cumplen los filtros. La hora solo cuenta con «abierto ahora». */
const matching = computed(() => (filtered.value ? filterRestaurants(all, filters.value, now.value) : all));

const details = computed(() =>
    all.map((restaurant) => {
        const status = openStatus(restaurant, now.value);
        const meters = distances?.[restaurant.slug];

        return {
            restaurant,
            open: status.state === 'open',
            meters: meters ?? Number.POSITIVE_INFINITY,
            status: openStatusText(status, t, locale.value),
            distance: meters === undefined ? null : formatDistance(meters, locale.value),
        };
    }),
);

/** Abiertos primero; entre ellos, el más cerca. Si empatan, el orden de siempre (sort es estable). */
function ranking(): string[] {
    return [...details.value].sort((a, b) => Number(b.open) - Number(a.open) || a.meters - b.meters).map(({ restaurant }) => restaurant.slug);
}

/** Los slugs en el orden en que se muestran: fijo mientras la lista está abierta. */
const order = shallowRef(ranking());
let rankedByDistance = distances !== null;

watch(
    () => distances,
    (current) => {
        if (current !== null && !rankedByDistance) {
            rankedByDistance = true;
            order.value = ranking();
        }
    },
);

// Solo los que cumplen los filtros. Uno que no estaba al fijar el orden (la
// lista se volvió a pedir) va al final.
const rows = computed(() => {
    const place = new Map(order.value.map((slug, index) => [slug, index]));
    const shown = new Set(matching.value.map(({ slug }) => slug));

    return details.value
        .filter(({ restaurant }) => shown.has(restaurant.slug))
        .sort((a, b) => (place.get(a.restaurant.slug) ?? place.size) - (place.get(b.restaurant.slug) ?? place.size));
});

const allSamples = computed(() => all.length > 0 && all.every(({ fictitious }) => fictitious));
const categories = computed(() => categoriesOf(all, locale.value));
const lunches = computed(() => todaysLunches(matching.value, now.value));

/** «Sugerime algo» no encontró ningún abierto: lo dice la región de estado hasta que cambien los filtros. */
const suggestionMissed = ref(false);

watch(filters, () => {
    suggestionMissed.value = false;
});

/** Cuántos quedan (o que no hay abiertos para sugerir): lo anuncia la región de estado al cambiar. */
const countMessage = computed(() => {
    if (suggestionMissed.value) {
        return filtered.value ? t('finder.suggest_none_filtered') : t('finder.suggest_none');
    }

    if (!filtered.value) {
        return all.length === 1 ? t('restaurants.count_one') : t('restaurants.count_many', { count: all.length });
    }

    return matching.value.length === 0 ? t('finder.none') : t('finder.count_filtered', { count: matching.value.length, total: all.length });
});

function suggest(): void {
    const pick = pickSuggestion(matching.value, now.value);

    suggestionMissed.value = pick === null;

    if (pick !== null) {
        emit('select', pick.slug);
    }
}

onMounted(() => {
    // Con «Almuerzos de hoy», el foco lo toma esa sección (TodaysLunches).
    if (start === 'heading') {
        heading.value?.focus({ preventScroll: true });
    }
});

/** Lleva el foco al botón de ese restaurante; si ya no está en la lista, al título. */
function focusItem(slug: string): void {
    const items = [...(list.value?.querySelectorAll<HTMLElement>('button[data-slug]') ?? [])];

    (items.find((item) => item.dataset.slug === slug) ?? heading.value)?.focus();
}

defineExpose({ focusItem });
</script>

<template>
    <section :aria-labelledby="headingId" class="flex min-h-0 flex-col">
        <div class="flex items-start justify-between gap-2">
            <h2 :id="headingId" ref="heading" tabindex="-1" class="py-2 text-lg leading-tight focus:outline-none md:text-xl">
                {{ t('restaurants.list_title') }}
            </h2>
            <button
                type="button"
                class="-mt-1 -mr-2 inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                :aria-label="t('restaurants.close_list')"
                @click="$emit('close')"
            >
                <Icon name="cerrar" />
            </button>
        </div>

        <!-- Todo lo de abajo del título se desplaza junto: con poco alto, el buscador no deja la lista sin lugar. -->
        <div class="-mx-2 min-h-0 overflow-y-auto overscroll-contain px-2">
            <RestaurantFilters :filters="filters" :categories="categories" @update:filters="emit('update:filters', $event)" />

            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p role="status" class="text-sm" data-count>{{ countMessage }}</p>
                <button
                    type="button"
                    class="inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 font-semibold transition-colors hover:bg-surface"
                    data-suggest
                    @click="suggest"
                >
                    <Icon name="estrella" :size="20" />
                    {{ t('finder.suggest') }}
                </button>
            </div>

            <button
                v-if="filtered && matching.length === 0"
                type="button"
                class="mt-2 inline-flex min-h-touch items-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco transition-colors hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                data-empty-clear
                @click="emit('update:filters', { ...NO_FILTERS })"
            >
                {{ t('finder.clear') }}
            </button>

            <TodaysLunches class="mt-2" :lunches="lunches" :filtered="filtered" :focus="start === 'lunches'" />

            <p v-if="allSamples" class="mt-2 mb-1"><SampleDataBadge /></p>

            <ul ref="list" class="-mx-2">
                <li v-for="{ restaurant, status, distance } in rows" :key="restaurant.slug" class="flex items-center gap-1">
                    <button
                        type="button"
                        class="flex min-h-touch min-w-0 flex-1 flex-col justify-center rounded-veni-sm px-2 py-1 text-left hover:bg-surface"
                        :data-slug="restaurant.slug"
                        @click="$emit('select', restaurant.slug)"
                    >
                        <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span class="font-semibold" data-name>{{ restaurant.name }}</span>
                            <SampleDataBadge v-if="restaurant.fictitious && !allSamples" />
                        </span>
                        <span class="text-sm text-ink-muted">
                            <span data-status>{{ status }}</span>
                            <template v-if="distance"> · <span data-distance>{{ distance }}</span></template>
                        </span>
                    </button>
                    <!-- El ícono solo no dice nada: el nombre del enlace lleva el del restaurante. -->
                    <Link
                        :href="restaurantUrl(restaurant.slug)"
                        class="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                        :aria-label="t('restaurants.view_details_of', { name: restaurant.name })"
                        :title="t('restaurants.view_details')"
                    >
                        <Icon name="chevron-derecha" />
                    </Link>
                </li>
            </ul>
        </div>
    </section>
</template>
