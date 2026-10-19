<script setup lang="ts">
import { useId } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { RestaurantProfile } from '@/restaurants/profile';

/**
 * Los domicilios de un restaurante en su ficha (#13): a qué barrios lleva y
 * cuánto cuesta, y lo que el restaurante quiera aclarar. Las zonas mandan
 * (ADR 0009): si no cargó ninguna, hace domicilios pero el costo hay que
 * preguntarlo. Quien la muestra decide si va: un restaurante que no hace
 * domicilios no lleva esta sección.
 */
const { delivery } = defineProps<{ delivery: RestaurantProfile['delivery'] }>();

const { t, locale } = useI18n();
const headingId = useId();
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.delivery.title') }}</h2>

        <p v-if="delivery.notes" class="mt-2 max-w-prose whitespace-pre-line" data-notes>{{ delivery.notes }}</p>

        <template v-if="delivery.zones.length > 0">
            <h3 :id="`${headingId}-zones`" class="mt-4 text-base">{{ t('restaurant.delivery.zones') }}</h3>

            <ul class="max-w-md divide-y divide-line" :aria-labelledby="`${headingId}-zones`">
                <li v-for="zone in delivery.zones" :key="zone.neighborhood" class="flex items-start justify-between gap-4 py-2" data-zone>
                    <span class="min-w-0 wrap-anywhere">{{ zone.neighborhood }}</span>
                    <span class="shrink-0 font-semibold tabular-nums">{{ formatPesos(zone.fee, locale) }}</span>
                </li>
            </ul>
        </template>

        <p v-else class="mt-2 text-ink-muted" data-ask>{{ t('restaurant.delivery.ask') }}</p>
    </section>
</template>
