<script setup lang="ts" generic="Extra extends Record<string, string>">
import { Head, Link } from '@inertiajs/vue3';
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import RequestField from '@/components/requests/RequestField.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import type { ContactFields } from '@/requests/useRequestForm';
import { emptyContact, FORM_ERROR, HONEYPOT_FIELD, useRequestForm } from '@/requests/useRequestForm';
import { restaurantUrl } from '@/restaurants/links';

/**
 * Lo común de «Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR 0026):
 * el encabezado, el contacto mínimo, la autorización de datos, el campo
 * trampa, el envío y la confirmación. Los campos propios de cada formulario
 * empiezan en `extra` y se dibujan en el slot, que recibe los campos para
 * enlazarlos y el aviso de cada uno.
 *
 * `novalidate`: los avisos son los del servidor, en el idioma de la página,
 * no los del navegador. Al fallar, el foco va al resumen de errores; al
 * enviarse, al título de la confirmación.
 */
const { title, intro, restaurant, sent, action, extra } = defineProps<{
    title: string;
    intro: string;
    restaurant: { slug: string; name: string; fictitious: boolean };
    sent: boolean;
    /** A dónde se manda (POST). */
    action: string;
    extra: Extra;
}>();

defineSlots<{
    default: (props: { fields: ContactFields & Extra; fieldError: (name: string) => string | undefined }) => unknown;
}>();

const form = useRequestForm<ContactFields & Extra>(action, { ...emptyContact(), ...extra });

const { t } = useI18n();

const summary = useTemplateRef<HTMLElement>('summary');
const sentHeading = useTemplateRef<HTMLElement>('sentHeading');

const errors = computed(() => form.errors.value);
const generalError = computed(() => errors.value[FORM_ERROR]);
const fieldErrors = computed(() => Object.entries(errors.value).filter(([name]) => name !== FORM_ERROR));
const fieldError = (name: string): string | undefined => errors.value[name];

const honeypotId = `${HONEYPOT_FIELD}-trap`;

/*
 * Sin v-model ni .prevent en los elementos del formulario: sus directivas
 * sumarían código al chunk de Vue, que baja con el arranque (como OrderCart).
 */
function onSubmit(event: Event): void {
    event.preventDefault();
    form.submit();
}

function onHoneypotInput(event: Event): void {
    form.fields.website = (event.target as HTMLInputElement).value;
}

function onConsentChange(event: Event): void {
    form.fields.accepts_privacy = (event.target as HTMLInputElement).checked;
}

watch(errors, async (current) => {
    if (Object.keys(current).length > 0) {
        await nextTick();
        summary.value?.focus();
    }
});

watch(
    () => sent,
    async (isSent) => {
        if (isSent) {
            await nextTick();
            sentHeading.value?.focus();
        }
    },
);
</script>

<template>
    <Head :title="title" />

    <div class="mx-auto w-full max-w-xl px-4 pt-2 pb-10">
        <Link :href="restaurantUrl(restaurant.slug)" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('requests.back') }}
        </Link>

        <section v-if="sent" class="mt-4" role="status" data-sent>
            <h1 ref="sentHeading" tabindex="-1" class="flex items-start gap-2 text-2xl leading-tight">
                <Icon name="check" :size="28" class="mt-0.5 shrink-0" />
                {{ t('requests.sent_title') }}
            </h1>
            <p class="mt-3 max-w-prose">{{ t('requests.sent_body') }}</p>
        </section>

        <template v-else>
            <h1 tabindex="-1" class="mt-2 text-2xl leading-tight wrap-anywhere">{{ title }}</h1>
            <p v-if="restaurant.fictitious" class="mt-2"><SampleDataBadge /></p>
            <p class="mt-3 max-w-prose">{{ intro }}</p>
            <p class="mt-2 text-sm text-ink-muted">{{ t('requests.fields_note') }}</p>

            <div
                v-if="generalError || fieldErrors.length > 0"
                ref="summary"
                tabindex="-1"
                role="alert"
                class="mt-4 rounded-veni-sm border-2 border-ink bg-surface p-3"
                data-errors
            >
                <p class="flex items-start gap-2 font-semibold">
                    <Icon name="informacion" :size="20" class="mt-0.5 shrink-0" />
                    <span>{{ generalError ?? t('requests.errors_summary') }}</span>
                </p>
                <ul v-if="fieldErrors.length > 0" class="mt-1 list-disc pl-8 text-sm">
                    <li v-for="[name, message] in fieldErrors" :key="name">{{ message }}</li>
                </ul>
            </div>

            <form class="mt-6 flex flex-col gap-5" novalidate @submit="onSubmit">
                <RequestField
                    v-model="form.fields.contact_name"
                    :label="t('requests.name')"
                    :error="fieldError('contact_name')"
                    autocomplete="name"
                    :maxlength="100"
                    required
                    data-field="contact_name"
                />
                <RequestField
                    v-model="form.fields.contact_phone"
                    :label="t('requests.phone')"
                    :hint="t('requests.phone_hint')"
                    :error="fieldError('contact_phone')"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel-national"
                    :maxlength="20"
                    required
                    data-field="contact_phone"
                />
                <RequestField
                    v-model="form.fields.contact_email"
                    :label="t('requests.email')"
                    :error="fieldError('contact_email')"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    :maxlength="254"
                    data-field="contact_email"
                />

                <slot :fields="form.fields" :field-error="fieldError" />

                <!-- Campo trampa: fuera de la vista, del orden del teclado y del lector de pantalla. -->
                <div class="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                    <label :for="honeypotId">{{ t('requests.honeypot') }}</label>
                    <input :id="honeypotId" :value="form.fields.website" type="text" :name="HONEYPOT_FIELD" tabindex="-1" autocomplete="off" data-honeypot @input="onHoneypotInput">
                </div>

                <div>
                    <details class="rounded-veni-sm border border-line px-3">
                        <summary class="flex min-h-touch cursor-pointer items-center font-semibold">{{ t('requests.privacy_summary') }}</summary>
                        <p class="pb-3 text-sm" data-privacy>{{ t('requests.privacy_body') }}</p>
                    </details>
                    <label class="mt-3 flex min-h-touch items-start gap-3">
                        <input
                            :checked="form.fields.accepts_privacy"
                            type="checkbox"
                            class="mt-1 size-5 shrink-0"
                            required
                            :aria-invalid="fieldError('accepts_privacy') ? 'true' : undefined"
                            data-field="accepts_privacy"
                            @change="onConsentChange"
                        >
                        <span>{{ t('requests.privacy_accept') }}</span>
                    </label>
                    <p v-if="fieldError('accepts_privacy')" class="mt-1 text-sm font-semibold" data-error>{{ fieldError('accepts_privacy') }}</p>
                </div>

                <button
                    type="submit"
                    class="inline-flex min-h-touch items-center justify-center gap-2 self-start rounded-full bg-veni-ciruela px-6 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave disabled:opacity-70 dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    :disabled="form.processing.value"
                    :aria-busy="form.processing.value ? 'true' : undefined"
                    data-submit
                >
                    {{ form.processing.value ? t('requests.sending') : t('requests.submit') }}
                </button>
            </form>
        </template>
    </div>
</template>
