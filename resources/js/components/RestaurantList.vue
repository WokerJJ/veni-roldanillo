<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import type { Component, FunctionalComponent } from 'vue';
import { computed, h, nextTick, onMounted, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';

import DishResults from '@/components/DishResults.vue';
import Icon from '@/components/Icon.vue';
import RestaurantFilters from '@/components/RestaurantFilters.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import TodaysLunches from '@/components/TodaysLunches.vue';
import { useI18n } from '@/composables/useI18n';
import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { hasFilters, NO_FILTERS } from '@/restaurants/filterParams';
import { categoriesOf, filterRestaurants } from '@/restaurants/finder';
import { restaurantUrl } from '@/restaurants/links';
import { openStatus } from '@/restaurants/openStatus';
import { openStatusText } from '@/restaurants/statusText';
import { useFinderPanel } from '@/restaurants/useFinder';
import { useFavorites } from '@/saved/favorites';
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
 * Con tres letras o más en el buscador (#17), arriba de todo, «Platos»: los
 * que responden en el servidor, de los restaurantes que cumplen los demás
 * filtros (DishResults.vue).
 *
 * Sin filtros, arriba de la lista van «Tus favoritos» (#16, ADR 0032), y al
 * final, «Guardado en este teléfono», que abre SavedOnDevice.vue (baja con
 * import() al tocarlo) para editar y borrar direcciones y favoritos.
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
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');
const list = useTemplateRef<HTMLElement>('list');

const filters = computed(() => given ?? NO_FILTERS);
/** Cuáles cumplen los filtros, «Sugerime algo» y la región de estado: lo mismo que la bienvenida (useFinder.ts). */
const { now, filtered, matching, lunches, message, announced, suggest: pick } = useFinderPanel(
    { restaurants: () => all, filters: () => given },
    {
        unfiltered: 'count',
        onFilters: (fixed) => {
            emit('update:filters', fixed);
        },
    },
);

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

/**
 * Para «Platos» (#17): los que cumplen los demás filtros, sin la búsqueda
 * (el plato es lo que se busca, no el nombre del restaurante). Sin otros
 * filtros o sin la lista todavía, ninguno se deja afuera: null.
 */
const allowedForDishes = computed(() => {
    const others = { ...filters.value, query: '' };

    return all.length === 0 || !hasFilters(others) ? null : new Set(filterRestaurants(all, others, now.value).map(({ slug }) => slug));
});


/**
 * «Tus favoritos» (#16, ADR 0032): los marcados en este teléfono que están en
 * el mapa, del último marcado al primero. Uno que se ocultó o se retiró no
 * viene en la lista y no aparece; si vuelve, vuelve como favorito.
 */
const favorites = useFavorites();
const favoriteRows = computed(() => {
    const bySlug = new Map(details.value.map((detail) => [detail.restaurant.slug, detail]));

    return favorites.slugs.value.map((slug) => bySlug.get(slug)).filter((detail) => detail !== undefined);
});

/** «Guardado en este teléfono»: la pantalla de lo guardado, que baja con import() al tocarlo. */
const manager = shallowRef<Component | null>(null);
const managing = ref(false);
const savedButton = useTemplateRef<HTMLButtonElement>('savedButton');
const Manager: FunctionalComponent = (_props, { attrs }) => (manager.value === null ? null : h(manager.value, attrs));

/** Si la pantalla de lo guardado ya bajó (una función: TypeScript no arrastra el null a la promesa). */
function managerLoaded(): boolean {
    return manager.value !== null;
}

function openManager(): void {
    if (managerLoaded()) {
        managing.value = true;

        return;
    }

    import('@/components/SavedOnDevice.vue')
        .then((module) => {
            manager.value = module.default;
            managing.value = true;
        })
        .catch((error: unknown) => {
            // Sin señal y sin la PWA guardada: el botón queda para volver a intentarlo.
            console.error('[lista] No se pudo abrir lo guardado en el teléfono.', error);
        });
}

async function closeManager(): Promise<void> {
    managing.value = false;
    await nextTick();
    savedButton.value?.focus();
}

const allSamples = computed(() => all.length > 0 && all.every(({ fictitious }) => fictitious));
const categories = computed(() => categoriesOf(all, locale.value));

function suggest(): void {
    const slug = pick();

    if (slug !== null) {
        emit('select', slug);
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

            <!-- Con tres letras o más, los platos primero: si se buscó «sancocho», es lo que se quería ver. -->
            <DishResults
                :query="filters.query"
                :allowed="allowedForDishes"
                @select="$emit('select', $event)"
                @clear-filters="emit('update:filters', { ...NO_FILTERS, query: filters.query })"
            />

            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                <!-- Se ve enseguida; el lector lo oye de la región de abajo, medio segundo después de dejar de teclear. -->
                <p class="text-sm" aria-hidden="true" data-count>{{ message }}</p>
                <p role="status" class="sr-only" data-count-status>{{ announced }}</p>
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

            <!-- Con filtros no: lo que se ve abajo es lo que se buscó. -->
            <section v-if="!filtered && favoriteRows.length > 0" class="mt-2" :aria-labelledby="`${headingId}-favorites`" data-favorites>
                <h3 :id="`${headingId}-favorites`" class="font-semibold">{{ t('favorites.title') }}</h3>
                <ul class="-mx-2">
                    <li v-for="{ restaurant, status } in favoriteRows" :key="restaurant.slug">
                        <button
                            type="button"
                            class="flex min-h-touch w-full min-w-0 flex-col justify-center rounded-veni-sm px-2 py-1 text-left hover:bg-surface"
                            :data-favorite-slug="restaurant.slug"
                            @click="$emit('select', restaurant.slug)"
                        >
                            <span class="font-semibold">{{ restaurant.name }}</span>
                            <span class="text-sm text-ink-muted">{{ status }}</span>
                        </button>
                    </li>
                </ul>
            </section>

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

            <!-- Direcciones y favoritos de este teléfono (#16): verlos, editarlos y borrarlos. -->
            <button
                ref="savedButton"
                type="button"
                class="mt-2 inline-flex min-h-touch items-center gap-2 rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                data-saved-open
                @click="openManager"
            >
                <Icon name="corazon" :size="20" />
                {{ t('saved.open') }}
            </button>
        </div>

        <Manager v-if="managing" :restaurants="all" @close="closeManager" />
    </section>
</template>
