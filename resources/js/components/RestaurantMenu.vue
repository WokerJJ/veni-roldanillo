<script setup lang="ts">
import { useId } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { MenuSection } from '@/restaurants/profile';

/**
 * El menú de un restaurante en su ficha (#13): por secciones, con el precio
 * de cada plato en pesos. El orden es el del restaurante y llega resuelto del
 * servidor, que tampoco manda los platos que el dueño sacó del menú ni las
 * secciones que quedaron vacías. Un plato «agotado hoy» sigue en la lista,
 * con su aviso: mañana vuelve.
 *
 * Las opciones y adiciones de cada plato, y armar el pedido, son del menú
 * interactivo (#14) y del carrito (#15): aquí el menú solo se lee.
 */
const { sections } = defineProps<{ sections: readonly MenuSection[] }>();

const { t, locale } = useI18n();
const headingId = useId();
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
                        <p class="font-semibold wrap-anywhere" :class="{ 'text-ink-muted': dish.sold_out }" data-name>{{ dish.name }}</p>
                        <p v-if="dish.description" class="mt-0.5 text-sm wrap-anywhere text-ink-muted" data-description>{{ dish.description }}</p>
                    </div>
                    <div class="shrink-0 text-right">
                        <p class="font-semibold tabular-nums" data-price>{{ formatPesos(dish.price, locale) }}</p>
                        <p v-if="dish.sold_out" class="mt-1">
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
