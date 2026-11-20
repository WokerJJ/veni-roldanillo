<script setup lang="ts">
import ChoiceChip from '../components/ChoiceChip.vue';
import TextField from '../components/TextField.vue';
import type { Draft, Errors } from '../draft';
import { t } from '../texts';

/** Paso 6: quién autoriza. El celular es donde llega el enlace de confirmación. */
const { draft, errors, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    patch: (changes: Partial<Draft>) => void;
}>();

function onPurpose(event: Event): void {
    patch({ purposeExplained: (event.target as HTMLInputElement).checked });
}
</script>

<template>
    <div class="step">
        <TextField id="campo-owner-name" :label="t('fields.owner_name')" :value="draft.ownerName" :error="errors.ownerName ?? ''" :maxlength="100" autocomplete="off" @input="(value) => patch({ ownerName: value })" />

        <fieldset class="group">
            <legend class="group__legend">{{ t('fields.owner_role') }}</legend>
            <div class="choices">
                <ChoiceChip type="radio" name="owner-role" value="owner" :label="t('fields.owner_role_owner')" :checked="draft.ownerRole === 'owner'" @change="() => patch({ ownerRole: 'owner' })" />
                <ChoiceChip type="radio" name="owner-role" value="manager" :label="t('fields.owner_role_manager')" :checked="draft.ownerRole === 'manager'" @change="() => patch({ ownerRole: 'manager' })" />
            </div>
        </fieldset>

        <TextField
            id="campo-owner-phone"
            :label="t('fields.owner_phone')"
            :help="t('fields.owner_phone_help')"
            :value="draft.ownerPhone"
            :error="errors.ownerPhone ?? ''"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            :maxlength="20"
            @input="(value) => patch({ ownerPhone: value })"
        />

        <div class="field" :class="{ 'field--error': errors.purpose }">
            <label class="check">
                <input class="check__input" type="checkbox" :checked="draft.purposeExplained" :aria-invalid="errors.purpose ? 'true' : undefined" @change="onPurpose">
                <span>{{ t('fields.purpose') }}</span>
            </label>
            <p v-if="errors.purpose" class="field__error" role="alert">{{ t(`errors.${errors.purpose}`) }}</p>
        </div>
    </div>
</template>
