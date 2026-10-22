<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { computed, onMounted, useId, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
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
 * enlace a la ficha completa del restaurante (#13). Con la ruta pedida
 * (`directionsOpen`), en lugar del botón va lo que la página ponga en el slot:
 * el panel de la ruta, que llega con import(). Va dentro del diálogo.
 *
 * Con la ruta abierta el resumen se reduce a una línea (#81): el nombre y un
 * solo botón de cerrar, que oculta la ruta (`closeDirections`) y devuelve el
 * resumen entero. El mapa queda a la vista.
 */
const { restaurant, directionsOpen } = defineProps<{ restaurant: Restaurant; directionsOpen?: boolean }>();

defineEmits<{ close: []; directions: []; closeDirections: [] }>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');

const status = computed(() => openStatus(restaurant, now.value));
const statusText = computed(() => openStatusText(status.value, t, locale.value));

onMounted(() => {
    heading.value?.focus({ preventScroll: true });
});
</script>

<template>
    <section role="dialog" aria-modal="false" :aria-labelledby="headingId">
        <div class="flex items-start justify-between gap-2">
            <h2
                :id="headingId"
                ref="heading"
                tabindex="-1"
                class="py-2 leading-tight focus:outline-none"
                :class="directionsOpen ? 'truncate text-base' : 'text-lg md:text-xl'"
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

        <slot v-if="directionsOpen" />

        <template v-else>
            <p v-if="restaurant.fictitious" class="mb-2"><SampleDataBadge /></p>

            <ul v-if="restaurant.categories.length > 0" class="flex flex-wrap gap-1.5" :aria-label="t('restaurants.categories')">
                <li v-for="category in restaurant.categories" :key="category.slug" class="rounded-full bg-surface px-2.5 py-0.5 text-sm">
                    {{ category.name }}
                </li>
            </ul>

            <p class="mt-3 flex items-start gap-2 text-sm" :class="status.state === 'open' ? 'font-semibold' : 'text-ink-muted'" data-status>
                <Icon name="reloj" :size="20" class="shrink-0" />
                <span>{{ statusText }}</span>
            </p>

            <p v-if="restaurant.delivery" class="mt-1.5 flex items-start gap-2 text-sm" data-delivery>
                <Icon name="check" :size="20" class="shrink-0" />
                <span>{{ t('restaurants.delivery') }}</span>
            </p>

            <div class="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    class="inline-flex min-h-touch items-center gap-1.5 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    data-directions
                    @click="$emit('directions')"
                >
                    <Icon name="ubicacion" :size="20" />
                    {{ t('directions.open') }}
                </button>
                <Link
                    :href="restaurantUrl(restaurant.slug)"
                    class="inline-flex min-h-touch items-center gap-1 rounded-full border border-line px-5 font-semibold hover:bg-surface"
                >
                    {{ t('restaurants.view_details') }}
                    <Icon name="chevron-derecha" :size="20" />
                </Link>
            </div>
        </template>
    </section>
</template>
