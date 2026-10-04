<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import Icon from '@/components/Icon.vue';
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

/**
 * Aviso de que sin conexión no se puede cambiar el idioma (ADR 0010: los
 * textos del otro idioma vienen del servidor). Se va solo a los 10 s o
 * cuando vuelve la señal.
 */
const NOTICE_MS = 10_000;
const offlineNotice = ref('');
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function hideNotice(): void {
    clearTimeout(hideTimer);
    offlineNotice.value = '';
}

function showOfflineNotice(): void {
    clearTimeout(hideTimer);
    offlineNotice.value = t('locale.offline');
    hideTimer = setTimeout(hideNotice, NOTICE_MS);
}

function choose(value: Locale): void {
    setLocale(value, { onOffline: showOfflineNotice });
}

onMounted(() => {
    window.addEventListener('online', hideNotice);
});

onBeforeUnmount(() => {
    window.removeEventListener('online', hideNotice);
    clearTimeout(hideTimer);
});
</script>

<template>
    <div class="relative">
        <!-- Botones de alternar: aria-pressed marca el idioma actual. -->
        <div role="group" :aria-label="t('locale.switcher')" class="inline-flex items-center rounded-full border border-line">
            <!-- Adorno que dice «idioma» sin palabras; el nombre lo da el grupo. -->
            <Icon name="idioma" :size="20" class="mr-1 ml-3 shrink-0 text-ink-muted" />
            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                :lang="option.value"
                :aria-label="option.name"
                :aria-pressed="locale === option.value"
                class="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full px-3 text-sm font-semibold text-ink transition-colors aria-pressed:bg-ink aria-pressed:text-canvas aria-[pressed=false]:hover:bg-surface"
                @click="choose(option.value)"
            >
                {{ option.code }}
            </button>
        </div>
        <!-- Región de estado siempre presente: el lector de pantalla anuncia el aviso al aparecer. -->
        <p
            role="status"
            :class="
                offlineNotice
                    ? 'absolute top-full right-0 z-30 mt-2 w-64 rounded-veni-md bg-ink p-3 text-sm text-canvas shadow-lg'
                    : 'sr-only'
            "
        >
            {{ offlineNotice }}
        </p>
    </div>
</template>
