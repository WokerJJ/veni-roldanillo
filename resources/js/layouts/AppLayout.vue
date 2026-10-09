<script setup lang="ts">
import { Link, router, usePage } from '@inertiajs/vue3';
import { onBeforeUnmount, useTemplateRef } from 'vue';

import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import UpdatePrompt from '@/components/UpdatePrompt.vue';
import { useI18n } from '@/composables/useI18n';
import wordmark from '@brand/logo/veni-wordmark.svg';
import wordmarkWhite from '@brand/logo/veni-wordmark-blanco.svg';

/**
 * `immersive`: la página ocupa todo el alto que deja la cabecera (el mapa) y
 * el layout va sin pie de página ni scroll propio. La página lo pide con
 * `defineOptions({ layout: { immersive: true } })`.
 */
const { immersive } = defineProps<{ immersive?: boolean }>();

const { t } = useI18n();
const year = new Date().getFullYear();

const page = usePage();
const main = useTemplateRef<HTMLElement>('main');

/** La ruta de una dirección de Inertia (`page.url`), sin sus parámetros. */
function pathOf(url: string): string {
    return new URL(url, window.location.href).pathname;
}

let currentPath = pathOf(page.url);

// El layout es persistente: al navegar no se vuelve a montar, el foco quedaría
// en <body> y nada anunciaría la página nueva. Cuando cambia la ruta, el foco
// va al contenido; no en la primera carga (Inertia también avisa ahí) ni
// cuando la misma página cambia sus parámetros. Del scroll se ocupa Inertia:
// arriba en una página nueva y, con atrás y adelante, donde estaba.
const stopFocusingContent = router.on('navigate', () => {
    const path = pathOf(page.url);

    if (path === currentPath) {
        return;
    }

    currentPath = path;
    main.value?.focus({ preventScroll: true });
});

onBeforeUnmount(stopFocusingContent);
</script>

<template>
    <div class="flex flex-col" :class="immersive ? 'h-dvh' : 'min-h-dvh'">
        <a
            href="#contenido"
            class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-touch focus:items-center focus:rounded-veni-sm focus:bg-veni-ciruela focus:px-4 focus:font-semibold focus:text-veni-blanco"
        >
            {{ t('layout.skip_to_content') }}
        </a>

        <header class="border-b border-line">
            <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
                <Link href="/" class="inline-flex min-h-touch items-center rounded-veni-sm">
                    <img :src="wordmark" :alt="t('layout.home_link')" width="72" height="40" class="h-10 w-auto dark:hidden">
                    <img
                        :src="wordmarkWhite"
                        :alt="t('layout.home_link')"
                        width="72"
                        height="40"
                        class="hidden h-10 w-auto dark:block"
                    >
                </Link>
                <div class="flex items-center gap-2">
                    <LocaleSwitcher />
                    <ThemeToggle />
                </div>
            </div>
        </header>

        <main id="contenido" ref="main" tabindex="-1" class="flex-1 focus:outline-none" :class="{ 'relative min-h-0': immersive }">
            <slot />
        </main>

        <footer v-if="!immersive" class="border-t border-line">
            <div class="mx-auto max-w-5xl px-4 py-6 text-sm text-ink-muted">
                <p>{{ t('layout.footer', { year }) }}</p>
            </div>
        </footer>

        <UpdatePrompt />
    </div>
</template>
