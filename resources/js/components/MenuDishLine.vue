<script setup lang="ts">
import DishPhoto from '@/components/DishPhoto.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { MenuDish } from '@/restaurants/profile';

/**
 * Lo que se ve de un plato en el menú: la miniatura de su foto (o el ícono,
 * #113), nombre, descripción, precio y, si
 * corresponde, «Agotado hoy» o «No disponible hoy» (con el ingrediente
 * esencial que falta, `without`) y los avisos de los ingredientes que hoy no
 * hay (`notes`, ADR 0033). RestaurantMenu lo pone dentro de un botón (si se
 * puede pedir) o de un bloque (si no).
 */
const {
    dish,
    soldOut,
    unavailable,
    without = null,
    notes = [],
} = defineProps<{ dish: MenuDish; soldOut: boolean; unavailable: boolean; without?: string | null; notes?: readonly string[] }>();

const { t, locale } = useI18n();
</script>

<template>
    <DishPhoto :image="dish.photo" alt="" size="thumb" />
    <span class="block min-w-0 flex-1">
        <span class="block font-semibold wrap-anywhere" :class="{ 'text-ink-muted': soldOut || unavailable }" data-name>{{ dish.name }}</span>
        <span v-if="dish.description" class="mt-0.5 block text-sm wrap-anywhere text-ink-muted" data-description>{{ dish.description }}</span>
        <span v-for="note in notes" :key="note" class="mt-0.5 block text-sm font-semibold wrap-anywhere" data-ingredient-note>{{ note }}</span>
        <!-- Con el ingrediente que falta el aviso es largo: va aquí, donde puede partirse, y no junto al precio. -->
        <span v-if="!soldOut && unavailable && without !== null" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold wrap-anywhere" data-unavailable>
                {{ t('restaurant.menu.unavailable_without', { name: without }) }}
            </span>
        </span>
    </span>
    <span class="block shrink-0 text-right">
        <span class="block font-semibold tabular-nums" data-price>{{ formatPesos(dish.price, locale) }}</span>
        <span v-if="soldOut" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-sold-out>
                {{ t('restaurant.menu.sold_out') }}
            </span>
        </span>
        <span v-else-if="unavailable && without === null" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-unavailable>
                {{ t('restaurant.menu.unavailable') }}
            </span>
        </span>
    </span>
</template>
