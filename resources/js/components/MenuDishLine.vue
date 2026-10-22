<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { MenuDish } from '@/restaurants/profile';

/**
 * Lo que se ve de un plato en el menú: nombre, descripción, precio y, si
 * corresponde, «Agotado hoy» o «No disponible hoy». RestaurantMenu lo pone
 * dentro de un botón (si se puede pedir) o de un bloque (si no).
 */
const { dish, soldOut, unavailable } = defineProps<{ dish: MenuDish; soldOut: boolean; unavailable: boolean }>();

const { t, locale } = useI18n();
</script>

<template>
    <span class="block min-w-0">
        <span class="block font-semibold wrap-anywhere" :class="{ 'text-ink-muted': soldOut || unavailable }" data-name>{{ dish.name }}</span>
        <span v-if="dish.description" class="mt-0.5 block text-sm wrap-anywhere text-ink-muted" data-description>{{ dish.description }}</span>
    </span>
    <span class="block shrink-0 text-right">
        <span class="block font-semibold tabular-nums" data-price>{{ formatPesos(dish.price, locale) }}</span>
        <span v-if="soldOut" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-sold-out>
                {{ t('restaurant.menu.sold_out') }}
            </span>
        </span>
        <span v-else-if="unavailable" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-unavailable>
                {{ t('restaurant.menu.unavailable') }}
            </span>
        </span>
    </span>
</template>
