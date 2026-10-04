<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';
import { useServiceWorker } from '@/pwa/serviceWorker';

/**
 * Aviso discreto de versión nueva de la app (#5): abajo, sin tapar la
 * cabecera ni robar el foco. El texto va en una región `status`, siempre en
 * la página, para que el lector de pantalla lo anuncie cuando aparece.
 */
const { t } = useI18n();
const { updateReady, update, dismiss } = useServiceWorker();
</script>

<template>
    <div
        :class="
            updateReady
                ? 'fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-veni-md bg-ink py-2 pr-2 pl-4 text-canvas shadow-lg'
                : 'sr-only'
        "
    >
        <p role="status" class="flex-1 text-sm font-semibold">
            {{ updateReady ? t('pwa.update_available') : '' }}
        </p>
        <template v-if="updateReady">
            <button
                type="button"
                class="inline-flex min-h-touch items-center rounded-full px-3 text-sm font-semibold hover:underline"
                @click="dismiss"
            >
                {{ t('pwa.dismiss') }}
            </button>
            <button
                type="button"
                class="inline-flex min-h-touch items-center rounded-full bg-canvas px-4 text-sm font-bold text-ink"
                @click="update"
            >
                {{ t('pwa.update') }}
            </button>
        </template>
    </div>
</template>
