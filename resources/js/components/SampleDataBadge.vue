<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';

/**
 * Rótulo «Datos de ejemplo»: acompaña a todo restaurante ficticio
 * (`fictitious` en el GeoJSON, `is_fictitious` en la base) allí donde se
 * muestre, para que nadie lo tome por un negocio real.
 */
const { t } = useI18n();
</script>

<template>
    <span class="inline-block rounded-full bg-veni-mango px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-veni-ciruela" data-sample>
        {{ t('restaurants.sample_data') }}
    </span>
</template>
