<script setup lang="ts">
import { computed, useId } from 'vue';

/**
 * Un campo de texto de los formularios de #20 con su etiqueta, su ayuda y su
 * aviso de error enlazados (aria-describedby y aria-invalid, WCAG 2.2): el
 * lector de pantalla los lee al entrar al campo.
 */
const props = withDefaults(
    defineProps<{
        label: string;
        modelValue: string;
        /** Id del control; sin él, uno propio. El resumen de errores enlaza a este id. */
        id?: string | undefined;
        hint?: string | undefined;
        error?: string | undefined;
        multiline?: boolean;
        type?: 'text' | 'tel' | 'email';
        autocomplete?: string;
        inputmode?: 'text' | 'tel' | 'email';
        maxlength?: number;
        required?: boolean;
    }>(),
    { id: undefined, hint: '', error: '', type: 'text', autocomplete: 'on', inputmode: 'text', maxlength: 1000 },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/**
 * Sin v-model en el <input> ni defineModel: la directiva y useModel sumarían
 * código al chunk de Vue, que baja con el arranque (como DishPicker).
 */
function onInput(event: Event): void {
    emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value);
}

const generatedId = useId();
const id = props.id ?? generatedId;
const hintId = `${id}-hint`;
const errorId = `${id}-error`;
const describedBy = computed(() => [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(' ') || undefined);

const inputClass =
    'mt-1 block w-full min-h-touch rounded-veni-sm border border-line bg-canvas px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:border-2 aria-invalid:border-ink';
</script>

<template>
    <div>
        <label :for="id" class="font-semibold">{{ label }}</label>
        <p v-if="hint" :id="hintId" class="text-sm text-ink-muted">{{ hint }}</p>
        <textarea
            v-if="multiline"
            :id="id"
            :value="modelValue"
            :class="inputClass"
            rows="4"
            :maxlength="maxlength"
            :required="required"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="describedBy"
            @input="onInput"
        />
        <input
            v-else
            :id="id"
            :value="modelValue"
            :class="inputClass"
            :type="type"
            :autocomplete="autocomplete"
            :inputmode="inputmode"
            :maxlength="maxlength"
            :required="required"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="describedBy"
            @input="onInput"
        >
        <p v-if="error" :id="errorId" class="mt-1 text-sm font-semibold" data-error>{{ error }}</p>
    </div>
</template>
