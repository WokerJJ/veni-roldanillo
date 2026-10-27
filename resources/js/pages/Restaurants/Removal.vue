<script setup lang="ts">
import RequestField from '@/components/requests/RequestField.vue';
import RequestFormPage from '@/components/requests/RequestFormPage.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import type { PrivacyNotice } from '@/requests/useRequestForm';
import { restaurantUrl } from '@/restaurants/links';

/**
 * «Pedir que retiren esta ficha» (#20, ADR 0026): GET
 * /restaurants/{slug}/removal, en toda ficha publicada. La solicitud queda
 * pendiente para administración: la ficha no se oculta sola.
 */
const { restaurant, sent, privacy } = defineProps<{
    restaurant: { slug: string; name: string; fictitious: boolean };
    sent: boolean;
    privacy: PrivacyNotice;
}>();

const { t } = useI18n();

/** Las relaciones que acepta el servidor (App\Enums\RemovalRelationship), con su texto. */
const RELATIONSHIPS: readonly { value: string; label: TranslationKey }[] = [
    { value: 'owner', label: 'removal.relationship_owner' },
    { value: 'manager', label: 'removal.relationship_manager' },
    { value: 'employee', label: 'removal.relationship_employee' },
    { value: 'other', label: 'removal.relationship_other' },
];

</script>

<template>
    <RequestFormPage
        :title="t('removal.title', { name: restaurant.name })" :intro="t('removal.intro')" :restaurant="restaurant" :sent="sent" :privacy="privacy"
        :action="`${restaurantUrl(restaurant.slug)}/removal`"
        :extra="{ relationship: '', reason: '' }"
    >
        <template #default="{ fields, fieldError, fieldId }">
            <fieldset data-field="relationship">
                <legend class="font-semibold">{{ t('removal.relationship') }}</legend>
                <!-- El aviso se anuncia en cada opción: el lector lo lee al llegar a cualquiera (WCAG 2.2). -->
                <label v-for="(relationship, index) in RELATIONSHIPS" :key="relationship.value" class="flex min-h-touch items-center gap-3">
                    <input
                        :id="index === 0 ? fieldId('relationship') : `${fieldId('relationship')}-${relationship.value}`"
                        type="radio"
                        name="relationship"
                        :value="relationship.value"
                        :checked="fields.relationship === relationship.value"
                        class="size-5 shrink-0"
                        required
                        :aria-invalid="fieldError('relationship') ? 'true' : undefined"
                        :aria-describedby="fieldError('relationship') ? `${fieldId('relationship')}-error` : undefined"
                        @change="fields.relationship = relationship.value"
                    >
                    <span>{{ t(relationship.label) }}</span>
                </label>
                <p v-if="fieldError('relationship')" :id="`${fieldId('relationship')}-error`" class="mt-1 text-sm font-semibold" data-error>
                    {{ fieldError('relationship') }}
                </p>
            </fieldset>

            <RequestField
                :id="fieldId('reason')"
                v-model="fields.reason"
                :label="t('removal.reason')"
                :hint="t('removal.reason_hint')"
                :error="fieldError('reason')"
                multiline
                :maxlength="1000"
                required
                data-field="reason"
            />
        </template>
    </RequestFormPage>
</template>
