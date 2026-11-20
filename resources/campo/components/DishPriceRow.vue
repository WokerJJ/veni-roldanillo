<script setup lang="ts">
import PriceInput from './PriceInput.vue';

import { t } from '../texts';

/**
 * La fila de un plato: su precio, lo que cada paso quiera poner en medio (el
 * alcohol, en la carta) y el botón de quitar. La comparten la carta y el
 * catálogo para que se vean y se comporten igual.
 */
const { id, value, invalid, removeName } = defineProps<{
    id: string;
    value: number | null;
    invalid: boolean;
    /** El nombre del plato, para el botón «Quitar». */
    removeName: string;
}>();

const emit = defineEmits<{ price: [price: number | null]; remove: []; enter: [] }>();
</script>

<template>
    <div class="dish__row">
        <PriceInput :id="id" :label="t('menu.dish_price')" :value="value" :invalid="invalid" @input="(price) => emit('price', price)" @enter="emit('enter')" />
        <slot />
        <button type="button" class="btn btn--quiet btn--remove" :aria-label="t('menu.remove_dish', { name: removeName })" @click="emit('remove')">✕</button>
    </div>
</template>
