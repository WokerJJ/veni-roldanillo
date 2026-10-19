<script setup lang="ts">
import { computed, useId } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatPesos } from '@/i18n/intl';
import { businessDay } from '@/restaurants/openStatus';
import type { MenuDish, MenuSection } from '@/restaurants/profile';

/**
 * El menú de un restaurante en su ficha (#13): por secciones, con el precio
 * de cada plato en pesos. El orden es el del restaurante y llega resuelto del
 * servidor, que tampoco manda los platos que el dueño sacó del menú ni las
 * secciones que quedaron vacías. Un plato «agotado hoy» sigue en la lista,
 * con su aviso: mañana vuelve.
 *
 * Si un plato está agotado hoy se calcula aquí, con la fecha que manda el
 * servidor y el día de Colombia: la ficha puede quedar abierta de un día para
 * otro, y el aviso se va solo a la medianoche.
 *
 * Las opciones y adiciones de cada plato, y armar el pedido, son del menú
 * interactivo (#14) y del carrito (#15): aquí el menú solo se lee.
 */
const { sections } = defineProps<{ sections: readonly MenuSection[] }>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();

const today = computed(() => businessDay(now.value).date);

/** «Agotado hoy» vale hasta su fecha, incluida. */
function soldOut(dish: MenuDish): boolean {
    return dish.sold_out_until !== null && dish.sold_out_until >= today.value;
}
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.menu.title') }}</h2>

        <p v-if="sections.length === 0" class="mt-2 text-ink-muted" data-empty>{{ t('restaurant.menu.empty') }}</p>

        <div v-for="(section, index) in sections" :key="index" class="mt-4" data-section>
            <h3 :id="`${headingId}-${index}`" class="text-base">{{ section.name }}</h3>

            <ul class="divide-y divide-line" :aria-labelledby="`${headingId}-${index}`">
                <li v-for="(dish, position) in section.dishes" :key="position" class="flex items-start justify-between gap-4 py-3" data-dish>
                    <div class="min-w-0">
                        <p class="font-semibold wrap-anywhere" :class="{ 'text-ink-muted': soldOut(dish) }" data-name>{{ dish.name }}</p>
                        <p v-if="dish.description" class="mt-0.5 text-sm wrap-anywhere text-ink-muted" data-description>{{ dish.description }}</p>
                    </div>
                    <div class="shrink-0 text-right">
                        <p class="font-semibold tabular-nums" data-price>{{ formatPesos(dish.price, locale) }}</p>
                        <p v-if="soldOut(dish)" class="mt-1">
                            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-sold-out>
                                {{ t('restaurant.menu.sold_out') }}
                            </span>
                        </p>
                    </div>
                </li>
            </ul>
        </div>
    </section>
</template>
