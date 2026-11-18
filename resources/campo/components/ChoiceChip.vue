<script setup lang="ts">
/**
 * Una opción que se toca: una casilla (varias a la vez) o un botón de radio
 * (una sola), con el aspecto de una pastilla de 48 px de alto. Es un
 * `<input>` real: el teclado y el lector de pantalla lo manejan como siempre.
 */
const { type, name, checked, label, value } = defineProps<{
    type: 'checkbox' | 'radio';
    name: string;
    checked: boolean;
    label: string;
    value: string;
}>();

const emit = defineEmits<{ change: [checked: boolean] }>();

function onChange(event: Event): void {
    emit('change', (event.target as HTMLInputElement).checked);
}
</script>

<template>
    <label class="choice">
        <input class="choice__input" :type="type" :name="name" :value="value" :checked="checked" @change="onChange">
        <span class="choice__label">{{ label }}</span>
    </label>
</template>
