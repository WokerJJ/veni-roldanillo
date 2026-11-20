<script setup lang="ts">
import FormField from './FormField.vue';

/**
 * Un campo de texto. Sin `v-model` sobre el elemento nativo: esa directiva
 * suma código de Vue al chunk compartido con el arranque (ADR 0048).
 */
const {
    id,
    label,
    value,
    help = '',
    error = '',
    type = 'text',
    inputmode = 'text',
    autocomplete = 'off',
    maxlength = 160,
} = defineProps<{
    id: string;
    label: string;
    value: string;
    help?: string;
    error?: string;
    type?: string;
    inputmode?: 'text' | 'tel' | 'numeric' | 'decimal' | undefined;
    autocomplete?: string;
    maxlength?: number;
}>();

const emit = defineEmits<{ input: [value: string] }>();

function onInput(event: Event): void {
    emit('input', (event.target as HTMLInputElement).value);
}
</script>

<template>
    <FormField :id="id" v-slot="{ describedBy, invalid }" :label="label" :help="help" :error="error">
        <input
            :id="id"
            class="input"
            :type="type"
            :value="value"
            :inputmode="inputmode"
            :autocomplete="autocomplete"
            :maxlength="maxlength"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            @input="onInput"
        >
    </FormField>
</template>
