<script setup lang="ts">
import { ref, watch } from 'vue';

import { formatThousands, parsePrice } from '../catalog';

/**
 * Un precio en pesos enteros, con el teclado numérico del teléfono. Acepta lo
 * que escribe la gente («3.500», «$ 3500») y entrega un entero o null. Mientras
 * se escribe no reformatea; al salir del campo muestra los miles («3.500»). Sin
 * `v-model` sobre el elemento nativo (ADR 0048). Enter avisa con `enter`.
 */
const { id, label, value, invalid, placeholder = '' } = defineProps<{
    id: string;
    label: string;
    value: number | null;
    invalid?: boolean;
    /** Lo que se ve vacío; vacío, la etiqueta. */
    placeholder?: string;
}>();

const emit = defineEmits<{ input: [price: number | null]; enter: [] }>();

const editing = ref(false);
const text = ref('');

// Si el precio cambia desde fuera mientras se escribe (se limpia, se aplica otro), el campo lo sigue.
watch(
    () => value,
    (next) => {
        if (editing.value && parsePrice(text.value) !== next) {
            text.value = next === null ? '' : String(next);
        }
    },
);

function shown(): string {
    if (editing.value) {
        return text.value;
    }

    return value === null ? '' : formatThousands(value);
}

function onFocus(): void {
    editing.value = true;
    text.value = value === null ? '' : String(value);
}

function onInput(event: Event): void {
    text.value = (event.target as HTMLInputElement).value;
    emit('input', parsePrice(text.value));
}
</script>

<template>
    <input
        :id="id"
        class="input input--price"
        type="text"
        inputmode="numeric"
        enterkeyhint="next"
        autocomplete="off"
        :aria-label="label"
        :placeholder="placeholder || label"
        :value="shown()"
        :aria-invalid="invalid ? 'true' : undefined"
        @focus="onFocus"
        @blur="editing = false"
        @input="onInput"
        @keydown.enter.prevent="emit('enter')"
    >
</template>
