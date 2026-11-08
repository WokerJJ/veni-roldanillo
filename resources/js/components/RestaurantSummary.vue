<script setup lang="ts">
import { Link, router } from '@inertiajs/vue3';
import { computed, onMounted, useId, useTemplateRef } from 'vue';

import FavoriteButton from '@/components/FavoriteButton.vue';
import Icon from '@/components/Icon.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { categoryIcon } from '@/icons/food';
import type { Restaurant } from '@/restaurants/api';
import { restaurantUrl } from '@/restaurants/links';
import { openStatus } from '@/restaurants/openStatus';
import { openStatusText } from '@/restaurants/statusText';

/**
 * Resumen de un restaurante del mapa (#9): nombre, tipo de comida, si está
 * abierto ahora y si hace domicilios; si es un dato de ejemplo, lo dice. Es un
 * panel de la página, no un popup de MapLibre: lleva los estilos de la app y
 * se lee con lector de pantalla.
 *
 * Al abrirse toma el foco en el nombre, para que se anuncie de quién es; quien
 * lo muestra lo cierra con `close` (el botón o Escape) y devuelve el foco.
 *
 * Termina en «Cómo llegar» (#11), que pide la ruta con `directions`, y en el
 * enlace a la ficha completa del restaurante (#13), y en «Favorito» (#16),
 * que lo marca solo en este teléfono. Con la ruta pedida
 * (`directionsOpen`), en lugar del botón va lo que la página ponga en el slot:
 * el panel de la ruta, que llega con import(). Va dentro del diálogo.
 *
 * Con la ruta abierta el resumen se reduce a una línea (#81): el nombre y un
 * solo botón de cerrar, que oculta la ruta (`closeDirections`) y devuelve el
 * resumen entero. El mapa queda a la vista.
 *
 * En la barra lateral de computador (ADR 0037) va debajo de la fila del
 * restaurante (`inRow`), que ya dice su nombre y su estado: no se repiten a
 * la vista, quedan para el lector de pantalla y el foco sigue yendo al
 * encabezado. Ahí el resumen cambia de lugar cuando la búsqueda o un filtro
 * sacan o devuelven su fila: si el foco está en un campo (el buscador, un
 * filtro), no se lo quita.
 *
 * Fuera de la fila (el panel del celular, #139, ADR 0041) las acciones van en
 * una fila: «Cómo llegar» ocupa lo que sobra y la ficha y «Favorito» son
 * botones redondos de 44 px con su nombre accesible. Arrastrar la cabecera
 * del resumen (el nombre) hacia arriba con el dedo abre la ficha, como las
 * apps de mapas; el botón de la ficha hace lo mismo para quien no arrastra.
 */
const { restaurant, directionsOpen, routeOffline, inRow } = defineProps<{
    restaurant: Restaurant;
    directionsOpen?: boolean;
    /** Debajo de su fila en la lista, que ya muestra su nombre y su estado. */
    inRow?: boolean;
    /** «Cómo llegar» no bajó (sin señal): en lugar del slot, el aviso y cómo pedirlo de nuevo. */
    routeOffline?: boolean;
}>();

defineEmits<{ close: []; directions: []; closeDirections: []; retryDirections: [] }>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');

/** Cuánto hay que subir el dedo (px) para abrir la ficha. */
const SWIPE_PX = 48;
let swipe: { pointer: number; x: number; y: number } | null = null;

function onSwipeStart(event: PointerEvent): void {
    swipe = inRow || directionsOpen || event.pointerType === 'mouse' || !event.isPrimary ? null : { pointer: event.pointerId, x: event.clientX, y: event.clientY };
}

function onSwipeEnd(event: PointerEvent): void {
    if (swipe === null || event.pointerId !== swipe.pointer) {
        return;
    }

    const up = swipe.y - event.clientY;
    const aside = Math.abs(event.clientX - swipe.x);
    swipe = null;

    if (up >= SWIPE_PX && up > aside) {
        router.visit(restaurantUrl(restaurant.slug));
    }
}

const status = computed(() => openStatus(restaurant, now.value));
const statusText = computed(() => openStatusText(status.value, t, locale.value));

onMounted(() => {
    if (!document.activeElement?.matches('input, select, textarea')) {
        heading.value?.focus({ preventScroll: true });
    }
});
</script>

<template>
    <section role="dialog" aria-modal="false" :aria-labelledby="headingId">
        <div
            class="flex items-start justify-between gap-2"
            :class="{ 'touch-none': !inRow && !directionsOpen }"
            data-summary-grab
            @pointerdown="onSwipeStart"
            @pointerup="onSwipeEnd"
            @pointercancel="swipe = null"
        >
            <h2
                :id="headingId"
                ref="heading"
                tabindex="-1"
                class="py-2 leading-tight focus:outline-none"
                :class="inRow ? 'sr-only' : directionsOpen ? 'truncate text-base' : 'text-lg md:text-xl'"
            >
                {{ restaurant.name }}
            </h2>
            <!-- Uno solo: con la ruta, la oculta y vuelve el resumen; sin ella, cierra el resumen. -->
            <button
                type="button"
                class="-mt-1 -mr-2 inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                :aria-label="directionsOpen ? t('directions.close') : t('restaurants.close_summary')"
                :data-close-directions="directionsOpen || undefined"
                @click="directionsOpen ? $emit('closeDirections') : $emit('close')"
            >
                <Icon name="cerrar" />
            </button>
        </div>

        <template v-if="directionsOpen">
            <slot />
            <!-- Si «Cómo llegar» no bajó (sin señal), queda cómo pedirlo de nuevo. Vivía en Home.vue: aquí baja con el resumen y no con el arranque (#12). -->
            <div v-if="routeOffline" class="mt-1" data-directions>
                <p role="status" class="text-sm" data-route-status>{{ t('directions.offline') }}</p>
                <button
                    type="button"
                    class="mt-2 inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold hover:bg-surface"
                    @click="$emit('retryDirections')"
                >
                    {{ t('directions.retry') }}
                </button>
            </div>
        </template>

        <template v-else>
            <p v-if="restaurant.fictitious" class="mb-2"><SampleDataBadge /></p>

            <ul v-if="restaurant.categories.length > 0" class="flex flex-wrap gap-2" :aria-label="t('restaurants.categories')">
                <li v-for="category in restaurant.categories" :key="category.slug" class="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm" :data-category="category.slug">
                    <Icon :name="categoryIcon(category.slug)" :size="16" />
                    {{ category.name }}
                </li>
            </ul>

            <p class="mt-3 flex items-start gap-2 text-sm" :class="inRow ? 'sr-only' : status.state === 'open' ? 'font-semibold' : 'text-ink-muted'" data-status>
                <Icon name="reloj" :size="20" class="shrink-0" />
                <span>{{ statusText }}</span>
            </p>

            <p v-if="restaurant.delivery" class="mt-2 flex items-start gap-2 text-sm" data-delivery>
                <Icon name="check" :size="20" class="shrink-0" />
                <span>{{ t('restaurants.delivery') }}</span>
            </p>

            <div class="mt-3 flex gap-2" :class="{ 'flex-wrap': inRow }" data-summary-actions>
                <button
                    type="button"
                    class="inline-flex min-h-touch items-center gap-2 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    :class="{ 'flex-1 justify-center': !inRow }"
                    data-directions
                    @click="$emit('directions')"
                >
                    <Icon name="ubicacion" :size="20" />
                    {{ t('directions.open') }}
                </button>
                <Link
                    v-if="inRow"
                    :href="restaurantUrl(restaurant.slug)"
                    class="inline-flex min-h-touch items-center gap-1 rounded-full border border-line px-5 font-semibold hover:bg-surface"
                >
                    {{ t('restaurants.view_details') }}
                    <Icon name="chevron-derecha" :size="20" />
                </Link>
                <!-- En el panel, un botón redondo: el nombre del enlace dice de quién es la ficha. -->
                <Link
                    v-else
                    :href="restaurantUrl(restaurant.slug)"
                    class="inline-flex size-touch shrink-0 items-center justify-center rounded-full border border-line hover:bg-surface"
                    :aria-label="t('restaurants.view_details_of', { name: restaurant.name })"
                    :title="t('restaurants.view_details')"
                    data-summary-details
                >
                    <Icon name="chevron-derecha" :size="20" />
                </Link>
                <FavoriteButton :slug="restaurant.slug" :name="restaurant.name" :compact="!inRow" />
            </div>
        </template>
    </section>
</template>
