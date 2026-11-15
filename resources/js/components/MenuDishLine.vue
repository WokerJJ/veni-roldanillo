<script setup lang="ts">
import DishPhoto from '@/components/DishPhoto.vue';
import IngredientChips from '@/components/IngredientChips.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { IngredientChip } from '@/order/ingredients';
import type { MenuDish } from '@/restaurants/profile';

/**
 * Lo que se ve de un plato en el menú (#141, M8): a la izquierda el nombre,
 * la descripción, el precio y, si corresponde, «Agotado hoy» o «No disponible
 * hoy» (con el ingrediente esencial que falta, `without`); los avisos de los
 * ingredientes que hoy no hay (`notes`, ADR 0033) que no se ven como chip, y
 * los chips de lo que lleva (`chips`, #115, ADR 0036) en una línea con «+n».
 * A la derecha, la miniatura de su foto (o el ícono, #113). RestaurantMenu lo
 * pone dentro de un botón (si se puede pedir) o de un bloque (si no).
 */
const {
    dish,
    soldOut,
    unavailable,
    without = null,
    notes = [],
    chips = [],
} = defineProps<{
    dish: MenuDish;
    soldOut: boolean;
    unavailable: boolean;
    without?: string | null;
    notes?: readonly string[];
    chips?: readonly IngredientChip[];
}>();

const { t, locale } = useI18n();
</script>

<template>
    <span class="block min-w-0 flex-1">
        <span class="block font-semibold wrap-anywhere" :class="{ 'text-ink-muted': soldOut || unavailable }" data-name>{{ dish.name }}</span>
        <span v-if="dish.description" class="mt-0.5 block text-sm wrap-anywhere text-ink-muted" data-description>{{ dish.description }}</span>
        <!-- El precio debajo del nombre, con el aviso de agotado al lado: con la foto a la derecha, el texto tiene todo el ancho. -->
        <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-semibold tabular-nums" data-price>{{ formatPesos(dish.price, locale) }}</span>
            <span v-if="soldOut" class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-sold-out>
                {{ t('restaurant.menu.sold_out') }}
            </span>
            <span v-else-if="unavailable && without === null" class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap" data-unavailable>
                {{ t('restaurant.menu.unavailable') }}
            </span>
        </span>
        <IngredientChips :chips="chips" :limit="3" />
        <span v-for="note in notes" :key="note" class="mt-1 block text-sm font-semibold wrap-anywhere" data-ingredient-note>{{ note }}</span>
        <!-- Con el ingrediente que falta el aviso es largo: va aquí, donde puede partirse, y no junto al precio. -->
        <span v-if="!soldOut && unavailable && without !== null" class="mt-1 block">
            <span class="inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold wrap-anywhere" data-unavailable>
                {{ t('restaurant.menu.unavailable_without', { name: without }) }}
            </span>
        </span>
    </span>
    <DishPhoto :image="dish.photo" :name="dish.name_es ?? dish.name" alt="" size="thumb" />
</template>
