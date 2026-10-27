<script setup lang="ts">
import RequestField from '@/components/requests/RequestField.vue';
import RequestFormPage from '@/components/requests/RequestFormPage.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import type { PrivacyNotice } from '@/requests/useRequestForm';
import { restaurantUrl } from '@/restaurants/links';

/**
 * «¿Es tu negocio? Reclámalo» (#20, ADR 0026): GET /restaurants/{slug}/claim.
 * Solo existe para una ficha publicada sin reclamar. Quien reclama no tiene
 * cuenta: deja su contacto, su rol y un mensaje, y administración lo verifica
 * a mano. Nada cambia solo.
 */
const { restaurant, sent, privacy } = defineProps<{
    restaurant: { slug: string; name: string; fictitious: boolean };
    sent: boolean;
    privacy: PrivacyNotice;
}>();

const { t } = useI18n();

/** Los roles que acepta el servidor (App\Enums\ClaimantRole), con su texto. */
const ROLES: readonly { value: string; label: TranslationKey }[] = [
    { value: 'owner', label: 'claim.role_owner' },
    { value: 'manager', label: 'claim.role_manager' },
];

</script>

<template>
    <RequestFormPage
        :title="t('claim.title', { name: restaurant.name })" :intro="t('claim.intro')" :restaurant="restaurant" :sent="sent" :privacy="privacy"
        :action="`${restaurantUrl(restaurant.slug)}/claim`"
        :extra="{ claimant_role: '', message: '' }"
    >
        <template #default="{ fields, fieldError, fieldId }">
            <fieldset data-field="claimant_role">
                <legend class="font-semibold">{{ t('claim.role') }}</legend>
                <!-- El aviso se anuncia en cada opción: el lector lo lee al llegar a cualquiera (WCAG 2.2). -->
                <label v-for="(role, index) in ROLES" :key="role.value" class="flex min-h-touch items-center gap-3">
                    <input
                        :id="index === 0 ? fieldId('claimant_role') : `${fieldId('claimant_role')}-${role.value}`"
                        type="radio"
                        name="claimant_role"
                        :value="role.value"
                        :checked="fields.claimant_role === role.value"
                        class="size-5 shrink-0"
                        required
                        :aria-invalid="fieldError('claimant_role') ? 'true' : undefined"
                        :aria-describedby="fieldError('claimant_role') ? `${fieldId('claimant_role')}-error` : undefined"
                        @change="fields.claimant_role = role.value"
                    >
                    <span>{{ t(role.label) }}</span>
                </label>
                <p v-if="fieldError('claimant_role')" :id="`${fieldId('claimant_role')}-error`" class="mt-1 text-sm font-semibold" data-error>
                    {{ fieldError('claimant_role') }}
                </p>
            </fieldset>

            <RequestField
                :id="fieldId('message')"
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
