<script setup lang="ts">
import { nextTick, onMounted, useId, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import type { Restaurant } from '@/restaurants/api';
import { openStatus } from '@/restaurants/openStatus';
import { openStatusText } from '@/restaurants/statusText';

/**
 * Los restaurantes del mapa como lista (#9): la alternativa al mapa para quien
 * usa teclado o lector de pantalla (los marcadores se dibujan en un lienzo y
 * no se pueden recorrer), y para quien prefiere leer. Cada uno es un botón
 * con su nombre y su estado, que abre el mismo resumen que tocar su marcador;
 * los de ejemplo llevan su rótulo.
 *
 * Al abrirse toma el foco en el título; quien la muestra la cierra con
 * `close` (el botón o Escape).
 */
const { restaurants } = defineProps<{ restaurants: readonly Restaurant[] }>();

defineEmits<{
    select: [slug: string];
    close: [];
}>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();
const heading = useTemplateRef<HTMLElement>('heading');
const list = useTemplateRef<HTMLElement>('list');

function statusOf(restaurant: Restaurant): string {
    return openStatusText(openStatus(restaurant, now.value), t, locale.value);
}

onMounted(() => {
    heading.value?.focus({ preventScroll: true });
});

defineExpose({
    /** Devuelve el foco al botón de un restaurante (al cerrar su resumen). */
    async focusItem(slug: string): Promise<void> {
        await nextTick();

        const item = [...(list.value?.querySelectorAll<HTMLElement>('button[data-slug]') ?? [])].find((button) => button.dataset.slug === slug);

        (item ?? heading.value)?.focus();
    },
});
</script>

<template>
    <section :aria-labelledby="headingId" class="flex min-h-0 flex-col">
        <div class="flex items-start justify-between gap-2">
            <h2 :id="headingId" ref="heading" tabindex="-1" class="py-2 text-lg leading-tight focus:outline-none min-[480px]:text-xl">
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

        <ul ref="list" class="-mx-2 min-h-0 overflow-y-auto overscroll-contain">
            <li v-for="restaurant in restaurants" :key="restaurant.slug">
                <button
                    type="button"
                    class="flex min-h-touch w-full flex-col justify-center rounded-veni-sm px-2 py-1.5 text-left hover:bg-surface"
                    :data-slug="restaurant.slug"
                    @click="$emit('select', restaurant.slug)"
                >
                    <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span class="font-semibold" data-name>{{ restaurant.name }}</span>
                        <SampleDataBadge v-if="restaurant.fictitious" />
                    </span>
                    <span class="text-sm text-ink-muted" data-status>{{ statusOf(restaurant) }}</span>
                </button>
            </li>
        </ul>
    </section>
</template>
