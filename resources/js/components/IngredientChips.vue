<script setup lang="ts">
import { computed } from 'vue';

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
 * Con `limit`, la carta del celular los muestra en una línea (#141, M8): los
 * primeros que lleva y «+n» por los demás. Lo que hoy no hay y los reemplazos
 * salen siempre, aunque pasen del tope: el estado de un plato no se esconde
 * detrás de un «+n». Con alguno de esos, la fila puede partirse en dos líneas
 * en lugar de recortar su texto.
 *
 * Los estilos van aquí, como en DishPhoto: viajan con la ficha y no en la
 * hoja de estilos del arranque.
 */
const { chips, limit = null } = defineProps<{ chips: readonly IngredientChip[]; limit?: number | null }>();

const { t, locale } = useI18n();

/** Los que se ven, en el orden del dueño, y cuántos quedan tras el «+n». */
const shown = computed(() => {
    if (limit === null) {
        return { list: chips, hidden: 0, changed: false };
    }

    // Los cambiados siempre salen; los normales ocupan lo que queda del tope, en orden.
    const room = Math.max(0, limit - chips.filter(({ kind }) => kind !== 'present').length);
    let presentShown = 0;
    const list = chips.filter(({ kind }) => {
        if (kind !== 'present') {
            return true;
        }

        presentShown++;

        return presentShown <= room;
    });

    return { list, hidden: chips.length - list.length, changed: list.some(({ kind }) => kind !== 'present') };
});
</script>

<template>
    <span v-if="chips.length > 0" class="ingredient-chips" :class="{ 'ingredient-chips-line': limit !== null && !shown.changed }" data-ingredient-chips>
        <span class="sr-only">{{ t('restaurant.menu.ingredients') }} </span>
        <span v-for="(chip, index) in shown.list" :key="index" class="ingredient-chip" :class="`ingredient-chip-${chip.kind}`" :data-ingredient-chip="chip.kind">
            <Icon :name="chipIconName(chip)" :size="16" class="ingredient-chip-icon" />
            <span v-if="chip.kind === 'present'">{{ chip.name }}</span>
            <span v-else-if="chip.kind === 'missing'">
                <s>{{ chip.name }}</s><span>{{ ' · ' }}{{ t('restaurant.menu.ingredient_missing') }}</span>
            </span>
            <span v-else-if="chip.price > 0">
                {{ t('restaurant.menu.ingredient_swap_price', { substitute: chip.substitute, name: chip.name, price: formatPesos(chip.price, locale) }) }}
            </span>
            <span v-else>{{ t('restaurant.menu.ingredient_swap', { substitute: chip.substitute, name: chip.name }) }}</span>
            <span v-if="index < shown.list.length - 1 || shown.hidden > 0" class="sr-only">, </span>
        </span>
        <span v-if="shown.hidden > 0" class="ingredient-chip ingredient-chip-more" data-ingredient-more>
            <span aria-hidden="true">+{{ shown.hidden }}</span>
            <span class="sr-only">{{ t('restaurant.menu.ingredients_more', { count: shown.hidden }) }}</span>
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

/* En una línea (M8): sin partirse; lo que no cabe se recorta, y el «+n» dice que hay más. */
.ingredient-chips-line {
    flex-wrap: nowrap;
    overflow: hidden;
}

.ingredient-chips-line .ingredient-chip {
    flex-shrink: 0;
    white-space: nowrap;
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
