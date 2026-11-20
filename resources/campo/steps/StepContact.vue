<script setup lang="ts">
import ChoiceChip from '../components/ChoiceChip.vue';
import TextField from '../components/TextField.vue';
import type { Draft, Errors } from '../draft';
import type { MetaCache } from '../storage';
import { t } from '../texts';

/** Paso 4: WhatsApp, teléfono, domicilio y medios de pago. */
const { draft, errors, meta, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    meta: MetaCache | null;
    patch: (changes: Partial<Draft>) => void;
}>();

function togglePayment(method: string, on: boolean): void {
    const without = draft.paymentMethods.filter((current) => current !== method);

    patch({ paymentMethods: on ? [...without, method] : without });
}
</script>

<template>
    <div class="step">
        <TextField
            id="campo-whatsapp"
            :label="t('fields.whatsapp')"
            :help="t('fields.whatsapp_help')"
            :value="draft.whatsapp"
            :error="errors.whatsapp ?? ''"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            :maxlength="20"
            @input="(value) => patch({ whatsapp: value })"
        />
        <TextField
            id="campo-phone"
            :label="t('fields.phone')"
            :value="draft.phone"
            :error="errors.phone ?? ''"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            :maxlength="20"
            @input="(value) => patch({ phone: value })"
        />

        <fieldset class="group">
            <legend class="group__legend">{{ t('fields.delivery') }}</legend>
            <div class="choices">
                <ChoiceChip type="radio" name="delivery" value="yes" :label="t('fields.yes')" :checked="draft.delivery === true" @change="() => patch({ delivery: true })" />
                <ChoiceChip type="radio" name="delivery" value="no" :label="t('fields.no')" :checked="draft.delivery === false" @change="() => patch({ delivery: false })" />
            </div>
            <p v-if="errors.delivery" class="field__error" role="alert">{{ t(`errors.${errors.delivery}`) }}</p>
        </fieldset>

        <fieldset class="group">
            <legend class="group__legend">{{ t('fields.payments') }}</legend>
            <div class="choices">
                <ChoiceChip
                    v-for="method in meta?.paymentMethods ?? ['cash', 'nequi', 'daviplata', 'card']"
                    :key="method"
                    type="checkbox"
                    name="payments"
                    :value="method"
                    :label="t(`payment.${method}`)"
                    :checked="draft.paymentMethods.includes(method)"
                    @change="(on) => togglePayment(method, on)"
                />
            </div>
        </fieldset>
    </div>
</template>
