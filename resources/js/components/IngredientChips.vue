<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import { chipIconName } from '@/icons/food';
import type { IngredientChip } from '@/order/ingredients';

/**
 * Los ingredientes de un plato en la carta, como chips (#115, ADR 0036):
 * ícono y nombre. El que hoy no hay sale atenuado, tachado y con «no hay
 * hoy» escrito: el estado nunca lo dice solo el color. El reemplazo sale
 * resaltado, con su nombre, su ícono y el recargo si suma.
 *
 * Va dentro del botón del plato (MenuDishLine), así que es todo <span>: un
 * botón no puede tener una lista adentro. El lector de pantalla oye los
 * chips como parte del nombre del botón, después de «Ingredientes:» y
 * separados por comas (que no se ven). El ícono es decorativo: el texto ya
 * dice lo mismo.
 *
 * Los estilos van aquí, como en DishPhoto: viajan con la ficha y no en la
 * hoja de estilos del arranque.
 */
const { chips } = defineProps<{ chips: readonly IngredientChip[] }>();

const { t, locale } = useI18n();
</script>

<template>
    <span v-if="chips.length > 0" class="ingredient-chips" data-ingredient-chips>
        <span class="sr-only">{{ t('restaurant.menu.ingredients') }} </span>
        <span v-for="(chip, index) in chips" :key="index" class="ingredient-chip" :class="`ingredient-chip-${chip.kind}`" :data-ingredient-chip="chip.kind">
            <Icon :name="chipIconName(chip)" :size="16" class="ingredient-chip-icon" />
            <span v-if="chip.kind === 'present'">{{ chip.name }}</span>
            <span v-else-if="chip.kind === 'missing'">
                <s>{{ chip.name }}</s><span>{{ ' · ' }}{{ t('restaurant.menu.ingredient_missing') }}</span>
            </span>
            <span v-else-if="chip.price > 0">
                {{ t('restaurant.menu.ingredient_swap_price', { substitute: chip.substitute, name: chip.name, price: formatPesos(chip.price, locale) }) }}
            </span>
            <span v-else>{{ t('restaurant.menu.ingredient_swap', { substitute: chip.substitute, name: chip.name }) }}</span>
            <span v-if="index < chips.length - 1" class="sr-only">, </span>
        </span>
    </span>
</template>

<style scoped>
.ingredient-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.375rem;
}

.ingredient-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--line);
    border-radius: 9999px;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1rem;
    overflow-wrap: anywhere;
}

.ingredient-chip-icon {
    flex-shrink: 0;
}

/* Atenuado y punteado; «no hay hoy» va escrito al lado. */
.ingredient-chip-missing {
    border-style: dashed;
    color: var(--ink-muted);
}

/* Resaltado: el borde de la marca y el texto en negrita. */
.ingredient-chip-swap {
    border-color: var(--veni-mango);
    background: var(--surface);
    font-weight: 600;
}
</style>
