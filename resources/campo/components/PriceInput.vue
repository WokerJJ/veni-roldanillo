<script setup lang="ts">
import { parsePrice } from '../catalog';

/**
 * Un precio en pesos enteros, con el teclado numérico del teléfono. Acepta lo
 * que escribe la gente («3.500», «$ 3500») y entrega un entero o null. Sin
 * `v-model` sobre el elemento nativo (ADR 0048).
 */
const { id, label, value, invalid } = defineProps<{
    id: string;
    label: string;
    value: number | null;
    invalid?: boolean;
}>();

const emit = defineEmits<{ input: [price: number | null] }>();

function onInput(event: Event): void {
    emit('input', parsePrice((event.target as HTMLInputElement).value));
}
</script>

<template>
    <input
        :id="id"
        class="input input--price"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :aria-label="label"
        :placeholder="label"
        :value="value === null ? '' : String(value)"
        :aria-invalid="invalid ? 'true' : undefined"
        @input="onInput"
    >
</template>
