<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import ThemeToggle from '@/components/ThemeToggle.vue';
import wordmark from '@brand/logo/veni-wordmark.svg';
import wordmarkWhite from '@brand/logo/veni-wordmark-blanco.svg';

const year = new Date().getFullYear();
</script>

<template>
    <div class="flex min-h-dvh flex-col">
        <a
            href="#contenido"
            class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-touch focus:items-center focus:rounded-veni-sm focus:bg-veni-ciruela focus:px-4 focus:font-semibold focus:text-veni-blanco"
        >
            Saltar al contenido
        </a>

        <header class="border-b border-line">
            <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
                <Link href="/" class="inline-flex min-h-touch items-center rounded-veni-sm">
                    <img :src="wordmark" alt="Vení, inicio" width="72" height="40" class="h-10 w-auto dark:hidden">
                    <img
                        :src="wordmarkWhite"
                        alt="Vení, inicio"
                        width="72"
                        height="40"
                        class="hidden h-10 w-auto dark:block"
                    >
                </Link>
                <ThemeToggle />
            </div>
        </header>

        <main id="contenido" tabindex="-1" class="flex-1 focus:outline-none">
            <slot />
        </main>

        <footer class="border-t border-line">
            <div class="mx-auto max-w-5xl px-4 py-6 text-sm text-ink-muted">
                <p>© {{ year }} Vení Roldanillo · Hecho en Roldanillo, Valle del Cauca</p>
            </div>
        </footer>
    </div>
</template>
