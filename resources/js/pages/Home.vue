<script setup lang="ts">
import { Head } from '@inertiajs/vue3';

import logo from '@brand/logo/veni-roldanillo.svg';
import logoWhite from '@brand/logo/veni-roldanillo-blanco.svg';
</script>

<template>
    <Head title="Inicio" />

    <section class="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-12 text-center sm:py-20">
        <img :src="logo" alt="Vení Roldanillo" width="430" height="285" class="h-auto w-56 sm:w-72 dark:hidden">
        <img
            :src="logoWhite"
            alt="Vení Roldanillo"
            width="430"
            height="285"
            class="hidden h-auto w-56 sm:w-72 dark:block"
        >

        <h1 class="text-4xl sm:text-5xl">Vení, comamos en Roldanillo</h1>

        <p class="max-w-prose text-lg text-ink-muted">
            Menús con precios, horarios y pedidos por WhatsApp de los restaurantes del pueblo, sin comisiones.
        </p>

        <p class="rounded-full bg-veni-mango px-4 py-2 font-semibold text-veni-ciruela">Muy pronto</p>
    </section>
</template>
