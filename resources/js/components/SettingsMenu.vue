<script setup lang="ts">
import { useId } from 'vue';

import { useI18n } from '@/composables/useI18n';

/**
 * «Ajustes» del inicio en el celular (#139, ADR 0041): el idioma y el tema,
 * que en el mapa ya no tienen cabecera donde ir. Van al final de la
 * bienvenida del panel, con los créditos, como una sección con su título:
 * se encuentran al subir el panel y con el lector, por el título. En las
 * demás páginas siguen en la cabecera. Baja aparte, con los enlaces del
 * layout (components/links.ts); los dos controles los pone el inicio en el
 * slot, con los que le da el layout (navigation/tabs.ts).
 */
const { t } = useI18n();
const headingId = useId();
</script>

<template>
    <section class="settings" :aria-labelledby="headingId" data-settings>
        <h2 :id="headingId" class="settings-title">{{ t('settings.title') }}</h2>
        <div class="settings-row">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.settings {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-line);
}

.settings-title {
    font-size: 1rem;
    line-height: 1.5rem;
}

.settings-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
}
</style>
