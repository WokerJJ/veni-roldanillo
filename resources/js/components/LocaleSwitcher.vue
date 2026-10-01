<script setup lang="ts">
import type { Locale } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';

const { locale, t, setLocale } = useI18n();

/**
 * Cada idioma se nombra en su propio idioma y con su atributo lang, para que
 * quien no entiende el idioma actual reconozca el suyo y el lector de pantalla
 * lo pronuncie bien. Por eso estos nombres no pasan por los archivos de idioma.
 */
const options: readonly { value: Locale; code: string; name: string }[] = [
    { value: 'es', code: 'ES', name: 'Español' },
    { value: 'en', code: 'EN', name: 'English' },
];
</script>

<template>
    <!-- Botones de alternar: aria-pressed marca el idioma actual. -->
    <div role="group" :aria-label="t('locale.switcher')" class="inline-flex items-center rounded-full border border-line">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            :lang="option.value"
            :aria-label="option.name"
            :aria-pressed="locale === option.value"
            class="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full px-3 text-sm font-semibold text-ink transition-colors aria-pressed:bg-ink aria-pressed:text-canvas aria-[pressed=false]:hover:bg-surface"
            @click="setLocale(option.value)"
        >
            {{ option.code }}
        </button>
    </div>
</template>
