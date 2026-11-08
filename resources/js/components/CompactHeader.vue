<script setup lang="ts">
import { Link, router } from '@inertiajs/vue3';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';

/**
 * La cabecera chica del celular (#139, ADR 0041). En las páginas que se
 * desplazan (la ficha, la guía, los documentos), la cabecera del layout sube
 * con la página y, pasada ella, aparece arriba esta: «‹ Volver» (al mapa) y
 * el nombre de la página. Solo por debajo de 1024 px. El nombre es el del
 * título de la página (su <h1>), que el lector ya leyó: aquí va oculto para
 * él y no se repite. Con «Reducir movimiento» aparece sin deslizarse.
 */
const { t } = useI18n();
const shown = ref(false);
const title = ref('');

/** Más abajo que esto (px, la cabecera del layout), aparece. */
const AFTER = 56;

function onScroll(): void {
    shown.value = window.scrollY > AFTER;
}

function readTitle(): void {
    title.value = document.querySelector('#contenido h1')?.textContent.trim() ?? '';
}

const stopReading = router.on('navigate', () => {
    void nextTick(() => {
        readTitle();
        onScroll();
    });
});

onMounted(() => {
    readTitle();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
    stopReading();
    window.removeEventListener('scroll', onScroll);
});
</script>

<template>
    <div class="compact-header" :data-shown="shown || undefined" :inert="!shown" data-compact-header>
        <Link href="/" class="compact-back" :aria-label="t('layout.back_to_map')">
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('layout.back') }}
        </Link>
        <p class="compact-title" aria-hidden="true">{{ title }}</p>
    </div>
</template>

<style scoped>
/*
 * Fija arriba, sólida (es contenido, no un control flotante) y con el margen
 * de arriba del sistema. Oculta, fuera de la vista y sin foco (`inert`). Lo
 * enfocado no queda debajo de ella (WCAG 2.4.11): la página deja su alto
 * libre arriba al llevar algo a la vista.
 */
.compact-header {
    position: fixed;
    inset-inline: 0;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: env(safe-area-inset-top) max(1rem, env(safe-area-inset-right)) 0 max(0.5rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--color-line);
    background: var(--color-canvas);
    translate: 0 -100%;
    visibility: hidden;
}

.compact-header[data-shown] {
    translate: 0;
    visibility: visible;
}

.compact-back {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    min-height: var(--veni-touch-min);
    padding-inline: 0.5rem;
    border-radius: 9999px;
    font-weight: 600;
}

.compact-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--veni-font-display);
    font-weight: 800;
}

@media (width < 64rem) {
    :global(html) {
        scroll-padding-top: calc(3.5rem + env(safe-area-inset-top));
    }
}

@media (prefers-reduced-motion: no-preference) {
    .compact-header {
        /* Sin el atajo: Tailwind leería la palabra y sumaría su utilidad al arranque. */
        transition-property: translate, visibility;
        transition-duration: 320ms;
        transition-timing-function: var(--veni-ease-spring);
    }
}

@media (min-width: 64rem) {
    .compact-header {
        display: none;
    }
}
</style>
