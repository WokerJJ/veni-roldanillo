<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { computed, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import type { Restaurant } from '@/restaurants/api';
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
 * Al abrirse toma el foco en el título; quien la muestra la cierra con
 * `close` (el botón o Escape) y, al volver de un resumen, devuelve el foco al
 * botón de ese restaurante con `focusItem`.
 */
const { restaurants, distances = null } = defineProps<{
    restaurants: readonly Restaurant[];
    /** Metros hasta cada restaurante, por slug, o null sin ubicación. */
    distances?: Readonly<Record<string, number>> | null;
}>();

defineEmits<{
    select: [slug: string];
    close: [];
}>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');
const list = useTemplateRef<HTMLElement>('list');

const details = computed(() =>
    restaurants.map((restaurant) => {
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

// Uno que no estaba al fijar el orden (la lista se volvió a pedir) va al final.
const rows = computed(() => {
    const place = new Map(order.value.map((slug, index) => [slug, index]));

    return [...details.value].sort((a, b) => (place.get(a.restaurant.slug) ?? place.size) - (place.get(b.restaurant.slug) ?? place.size));
});

const allSamples = computed(() => restaurants.length > 0 && restaurants.every(({ fictitious }) => fictitious));

onMounted(() => {
    heading.value?.focus({ preventScroll: true });
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

        <p v-if="allSamples" class="mb-1"><SampleDataBadge /></p>

        <ul ref="list" class="-mx-2 min-h-0 overflow-y-auto overscroll-contain">
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
    </section>
</template>
