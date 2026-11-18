<script setup lang="ts">
import PinPicker from '../components/PinPicker.vue';
import TextField from '../components/TextField.vue';
import type { Draft, Errors } from '../draft';
import { t } from '../texts';

/** Paso 2: la dirección, una referencia y el punto del negocio. */
const { draft, errors, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    patch: (changes: Partial<Draft>) => void;
}>();
</script>

<template>
    <div class="step">
        <TextField id="campo-address" :label="t('fields.address')" :value="draft.address" :error="errors.address ?? ''" autocomplete="street-address" @input="(value) => patch({ address: value })" />
        <TextField id="campo-reference" :label="t('fields.reference')" :help="t('fields.reference_help')" :value="draft.reference" @input="(value) => patch({ reference: value })" />

        <PinPicker :draft="draft" :patch="patch" />
        <p v-if="errors.location" class="field__error" role="alert">{{ t(`errors.${errors.location}`) }}</p>
    </div>
</template>
