<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../texts';

/**
 * Una pregunta del formulario: su etiqueta, la ayuda y el error, enlazados al
 * control con `aria-describedby` (lo arma quien usa el campo con `describedBy`).
 */
const { id, label, help = '', error = '' } = defineProps<{
    id: string;
    label: string;
    help?: string;
    /** La clave de `errors.*`, o vacío si no hay error. */
    error?: string;
}>();

const helpId = computed(() => `${id}-help`);
const errorId = computed(() => `${id}-error`);
</script>

<template>
    <div class="field" :class="{ 'field--error': error !== '' }">
        <label class="field__label" :for="id">{{ label }}</label>
        <p v-if="help" :id="helpId" class="field__help">{{ help }}</p>
        <slot :described-by="[help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined" :invalid="error !== ''" />
        <p v-if="error" :id="errorId" class="field__error" role="alert">{{ t(`errors.${error}`) }}</p>
    </div>
</template>
