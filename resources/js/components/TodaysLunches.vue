<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { onMounted, useTemplateRef } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { LunchOfTheDay } from '@/restaurants/finder';
import { restaurantUrl } from '@/restaurants/links';

/**
 * «Almuerzos de hoy» (#12): los almuerzos del día que publicaron los
 * restaurantes que cumplen los filtros, del más barato al más caro, con el
 * precio y un enlace a la ficha. Llegan con la capa del mapa (ADR 0028); el
 * de otro día ya no está en `lunches` (finder.ts).
 *
 * Es un <details> nativo: cerrado deja ver los resultados en el panel a media
 * altura. Abre ya abierto, y con el foco, si se llegó desde «Almuerzos de hoy»
 * de la bienvenida (`focus`).
 */
const { lunches, filtered, focus } = defineProps<{
    lunches: readonly LunchOfTheDay[];
    /** Hay filtros puestos: el aviso de que no hay almuerzos lo dice. */
    filtered?: boolean;
    /** Abre desplegado y con el foco en su rótulo. */
    focus?: boolean;
}>();

const { t, locale } = useI18n();
const summary = useTemplateRef<HTMLElement>('summary');

onMounted(() => {
    if (focus) {
        summary.value?.focus({ preventScroll: false });
    }
});
</script>

<template>
    <details class="border-t border-line pt-1" :open="focus" data-lunches>
        <summary ref="summary" class="flex min-h-touch cursor-pointer items-center rounded-veni-sm px-2 font-semibold hover:bg-surface">
            {{ lunches.length > 0 ? t('lunches.title_count', { count: lunches.length }) : t('lunches.title') }}
        </summary>

        <p v-if="lunches.length === 0" class="px-2 pb-2 text-sm text-ink-muted">{{ filtered ? t('lunches.none_filtered') : t('lunches.none') }}</p>

        <ul v-else>
            <li v-for="{ restaurant, lunch } in lunches" :key="restaurant.slug">
                <Link
                    :href="restaurantUrl(restaurant.slug)"
                    class="flex min-h-touch flex-col justify-center rounded-veni-sm px-2 py-1 hover:bg-surface"
                    data-lunch
                >
                    <span class="flex flex-wrap items-center justify-between gap-x-2">
                        <span class="font-semibold">{{ restaurant.name }}</span>
                        <span class="font-semibold" data-price>{{ formatPesos(lunch.price, locale) }}</span>
                    </span>
                    <span class="text-sm text-ink-muted">{{ lunch.description }}</span>
                </Link>
            </li>
        </ul>
    </details>
</template>
