<script setup lang="ts">
import { Head } from '@inertiajs/vue3';

import { useI18n } from '@/composables/useI18n';
import logo from '@brand/logo/veni-roldanillo.svg';
import logoWhite from '@brand/logo/veni-roldanillo-blanco.svg';

const { t } = useI18n();
</script>

<template>
    <Head :title="t('home.title')" />

    <section class="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-12 text-center sm:py-20">
        <img :src="logo" :alt="t('home.logo_alt')" width="430" height="285" class="h-auto w-56 sm:w-72 dark:hidden">
        <img
            :src="logoWhite"
            :alt="t('home.logo_alt')"
            width="430"
            height="285"
            class="hidden h-auto w-56 sm:w-72 dark:block"
        >

        <h1 class="text-4xl sm:text-5xl">{{ t('home.heading') }}</h1>

        <p class="max-w-prose text-lg text-ink-muted">
            {{ t('home.intro') }}
        </p>

        <p class="rounded-full bg-veni-mango px-4 py-2 font-semibold text-veni-ciruela">{{ t('home.coming_soon') }}</p>
    </section>
</template>
