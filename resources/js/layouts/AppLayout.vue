<script setup lang="ts">
import { Link, router, usePage } from '@inertiajs/vue3';
import type { FunctionalComponent } from 'vue';
import { h, onBeforeUnmount, provide, shallowRef, useTemplateRef } from 'vue';

import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import UpdatePrompt from '@/components/UpdatePrompt.vue';
import type * as Links from '@/components/links';
import { useI18n } from '@/composables/useI18n';
import { SETTINGS } from '@/navigation/tabs';
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

/*
| La navegación de la cabecera («Mapa · Guía de platos», ADR 0037), la guía
| de platos y los documentos legales del pie (#23, ADR 0030) bajan aparte, en
| un solo chunk (components/links.ts): el layout viaja en el arranque y en él
| no cabían. La navegación de la cabecera se ve desde 1024 px; por debajo, la
| barra de pestañas de abajo (TabBar, #139, ADR 0041), que baja en el mismo
| chunk con la cabecera chica que aparece al desplazar (CompactHeader). En el
| mapa del celular no hay cabecera: el mapa llega arriba, y el idioma y el
| tema van en «Ajustes», en el panel; en las demás páginas del celular la
| cabecera lleva el idioma y no repite el tema (#147). Si no bajan (sin señal), el pie queda
| con los créditos, que sí van en el arranque, y la cabecera con el logo, que
| lleva al mapa.
*/
const links = shallowRef<typeof Links>();
const lazy =
    (part: keyof typeof Links): FunctionalComponent =>
    (_props, { attrs }) =>
        links.value === undefined ? null : h(links.value[part], attrs);
const MainNav = lazy('MainNav');
const DishGuideLink = lazy('DishGuideLink');
const LegalLinks = lazy('LegalLinks');
const TabBar = lazy('TabBar');
const CompactHeader = lazy('CompactHeader');
provide(SETTINGS, [LocaleSwitcher, ThemeToggle]);

import('@/components/links')
    .then((module) => {
        links.value = module;
    })
    .catch((error: unknown) => {
        console.error('[layout] No se pudieron cargar los enlaces legales.', error);
    });
</script>

<template>
    <div class="flex flex-col" :class="immersive ? 'h-dvh' : 'min-h-dvh'">
        <a
            href="#contenido"
            class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-touch focus:items-center focus:rounded-veni-sm focus:bg-veni-ciruela focus:px-4 focus:font-semibold focus:text-veni-blanco"
        >
            {{ t('layout.skip_to_content') }}
        </a>

        <!--
            Con el mapa (immersive), solo desde 1024 px: en el celular el mapa
            llega hasta arriba (#139). En el celular, unos 52 px (el selector de idioma, 46, y 2 px arriba y
            abajo, más el borde): el mapa gana alto. Con el mapa (immersive), la cabecera va
            a lo ancho, con el mismo margen de 16 px que el panel del inicio:
            una sola grilla, sin el logo corrido hacia el centro.
        -->
        <header class="border-b border-line" :class="{ 'max-lg:hidden': immersive }">
            <div class="veni-safe-x flex items-center justify-between gap-4 py-0.5 md:py-2" :class="{ 'mx-auto max-w-6xl': !immersive }">
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
                <!-- «Mapa · Guía de platos», con la sección actual marcada: baja con los documentos legales. -->
                <MainNav />
                <!--
                    El idioma sigue en el celular: quien llega a una ficha por un
                    enlace lo cambia sin salir. El tema, no (#147): va en «Ajustes».
                -->
                <div class="flex items-center gap-2">
                    <LocaleSwitcher />
                    <ThemeToggle class="max-lg:hidden" />
                </div>
            </div>
        </header>

        <!-- Fuera del mapa, el contenido suma a los lados el margen del sistema (veni-safe-inset, #139). -->
        <main id="contenido" ref="main" tabindex="-1" class="flex-1 focus:outline-none" :class="immersive ? 'relative min-h-0' : 'veni-safe-inset'">
            <slot />
        </main>

        <footer v-if="!immersive" class="border-t border-line">
            <div class="veni-safe-x mx-auto max-w-6xl py-6 text-sm text-ink-muted">
                <p>{{ t('layout.footer', { year }) }}</p>
                <div class="flex flex-wrap gap-x-4">
                    <!-- La atribución de OpenStreetMap (ODbL) y cómo pedir sus datos: ADR 0021. -->
                    <Link href="/credits" class="inline-flex min-h-touch items-center underline" data-credits>
                        {{ t('credits.link') }}
                    </Link>
                    <DishGuideLink />
                    <LegalLinks />
                </div>
            </div>
        </footer>

        <CompactHeader v-if="!immersive" />
        <TabBar :immersive="immersive" />

        <UpdatePrompt />
    </div>
</template>
