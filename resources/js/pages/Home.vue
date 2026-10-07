<script setup lang="ts">
import { Head } from '@inertiajs/vue3';

import MapView from '@/components/MapView.vue';
import { useI18n } from '@/composables/useI18n';

// El mapa ocupa todo el alto bajo la cabecera: el layout va sin pie de página.
defineOptions({ layout: { immersive: true } });

const { t } = useI18n();
</script>

<template>
    <Head :title="t('home.title')" />

    <div class="absolute inset-0">
        <!--
            Bienvenida sobre el mapa (va antes en el documento: el título se
            lee primero). En un celular vertical queda abajo, a lo ancho, y
            deja libre la franja de la atribución de OpenStreetMap (la misma
            holgura que el aviso de versión nueva) y, si ese aviso se ve, se
            corre encima de él (UpdatePrompt.vue); desde 480 px de ancho
            (también un celular acostado, que es bajo) queda arriba a la
            izquierda, sin tocar los botones de zoom.
        -->
        <section
            class="absolute inset-x-3 bottom-[calc(var(--veni-attribution-clearance)_+_var(--veni-update-prompt-space,0px))] z-10 rounded-veni-md border border-line bg-canvas/95 p-4 shadow-lg min-[480px]:inset-x-auto min-[480px]:top-4 min-[480px]:bottom-auto min-[480px]:left-4 min-[480px]:max-w-sm"
        >
            <h1 class="text-xl min-[480px]:text-2xl">{{ t('home.heading') }}</h1>
            <p class="mt-1 text-sm text-ink-muted">{{ t('home.intro') }}</p>
            <p class="mt-3 inline-block rounded-full bg-veni-mango px-3 py-1 text-sm font-semibold text-veni-ciruela">
                {{ t('home.coming_soon') }}
            </p>
        </section>

        <MapView />
    </div>
</template>
