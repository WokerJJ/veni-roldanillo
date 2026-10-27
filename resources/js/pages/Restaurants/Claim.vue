<script setup lang="ts">
import { useId } from 'vue';

import RequestField from '@/components/requests/RequestField.vue';
import RequestFormPage from '@/components/requests/RequestFormPage.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import { restaurantUrl } from '@/restaurants/links';

/**
 * «¿Es tu negocio? Reclámalo» (#20, ADR 0026): GET /restaurants/{slug}/claim.
 * Solo existe para una ficha publicada sin reclamar. Quien reclama no tiene
 * cuenta: deja su contacto, su rol y un mensaje, y administración lo verifica
 * a mano. Nada cambia solo.
 */
const { restaurant, sent } = defineProps<{
    restaurant: { slug: string; name: string; fictitious: boolean };
    sent: boolean;
}>();

const { t } = useI18n();
const roleLegendId = useId();

/** Los roles que acepta el servidor (App\Enums\ClaimantRole), con su texto. */
const ROLES: readonly { value: string; label: TranslationKey }[] = [
    { value: 'owner', label: 'claim.role_owner' },
    { value: 'manager', label: 'claim.role_manager' },
];

</script>

<template>
    <RequestFormPage
        :title="t('claim.title', { name: restaurant.name })" :intro="t('claim.intro')" :restaurant="restaurant" :sent="sent"
        :action="`${restaurantUrl(restaurant.slug)}/claim`"
        :extra="{ claimant_role: '', message: '' }"
    >
        <template #default="{ fields, fieldError }">
            <fieldset :aria-describedby="fieldError('claimant_role') ? `${roleLegendId}-error` : undefined" data-field="claimant_role">
                <legend :id="roleLegendId" class="font-semibold">{{ t('claim.role') }}</legend>
                <label v-for="role in ROLES" :key="role.value" class="flex min-h-touch items-center gap-3">
                    <input type="radio" name="claimant_role" :value="role.value" :checked="fields.claimant_role === role.value" class="size-5 shrink-0" required @change="fields.claimant_role = role.value">
                    <span>{{ t(role.label) }}</span>
                </label>
                <p v-if="fieldError('claimant_role')" :id="`${roleLegendId}-error`" class="mt-1 text-sm font-semibold" data-error>
                    {{ fieldError('claimant_role') }}
                </p>
            </fieldset>

            <RequestField
                v-model="fields.message"
                :label="t('claim.message')"
                :hint="t('claim.message_hint')"
                :error="fieldError('message')"
                multiline
                :maxlength="1000"
                data-field="message"
            />
        </template>
    </RequestFormPage>
</template>
