<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';

import { useI18n } from '@/composables/useI18n';

/**
 * La navegación de la cabecera (ADR 0037): «Mapa · Guía de platos», enlaces
 * reales con la sección en que se está marcada con `aria-current="page"`. En
 * otra página (una ficha, un documento) no marca ninguna. Baja aparte del
 * arranque, con los documentos legales (components/links.ts).
 */
const { t } = useI18n();
const page = usePage();

const NAV = [
    { href: '/', label: 'layout.nav_map' },
    { href: '/dishes', label: 'layout.nav_dishes' },
] as const;

/** La sección en que se está: la ruta de la dirección de Inertia, sin sus parámetros. */
const path = computed(() => new URL(page.url, window.location.href).pathname);
</script>

<template>
    <nav :aria-label="t('layout.nav_label')" data-main-nav>
        <ul class="flex items-center gap-1">
            <li v-for="item in NAV" :key="item.href">
                <Link
                    :href="item.href"
                    class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold hover:bg-surface"
                    :class="{ 'bg-surface underline underline-offset-4': path === item.href }"
                    :aria-current="path === item.href ? 'page' : undefined"
                >
                    {{ t(item.label) }}
                </Link>
            </li>
        </ul>
    </nav>
</template>
