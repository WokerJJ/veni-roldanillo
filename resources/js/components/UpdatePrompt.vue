<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { useServiceWorker } from '@/pwa/serviceWorker';

/**
 * Aviso discreto de versión nueva de la app (#5): abajo, sin tapar la
 * cabecera ni robar el foco. El texto va en una región `status`, siempre en
 * la página, para que el lector de pantalla lo anuncie cuando aparece.
 *
 * Flota encima de la franja de la atribución del mapa
 * (--veni-attribution-clearance, resources/css/app.css). Mientras se ve,
 * deja en <html> el lugar que ocupa (--veni-update-prompt-space): la
 * bienvenida del inicio, que también va abajo, se corre hacia arriba y no
 * queda debajo del aviso, con cualquier ancho o tamaño de texto.
 */
const { t } = useI18n();
const { updateReady, update, dismiss } = useServiceWorker();

const PROMPT_SPACE = '--veni-update-prompt-space';
const box = useTemplateRef<HTMLElement>('box');
let observer: ResizeObserver | undefined;

function publishSpace(): void {
    const style = document.documentElement.style;

    if (updateReady.value && box.value) {
        style.setProperty(PROMPT_SPACE, `calc(${String(box.value.offsetHeight)}px + 0.5rem)`);
    } else {
        style.removeProperty(PROMPT_SPACE);
    }
}

watch(
    updateReady,
    (ready) => {
        observer?.disconnect();
        observer = undefined;
        publishSpace();

        if (ready && box.value && typeof ResizeObserver === 'function') {
            observer = new ResizeObserver(publishSpace);
            observer.observe(box.value);
        }
    },
    { flush: 'post' },
);

onBeforeUnmount(() => {
    observer?.disconnect();
    document.documentElement.style.removeProperty(PROMPT_SPACE);
});

/** Destino de «Saltar al contenido» (AppLayout.vue). */
const MAIN_ID = 'contenido';

/** Quién tenía el foco antes de que entrara al aviso. */
let focusedBefore: HTMLElement | null = null;

function rememberFocus(event: FocusEvent): void {
    // Solo al entrar: pasar de un botón del aviso al otro no cuenta.
    if (!(event.relatedTarget instanceof Node) || !box.value?.contains(event.relatedTarget)) {
        focusedBefore = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    }
}

/**
 * «Ahora no». Los botones desaparecen con el aviso: si el foco estaba en uno,
 * el navegador lo dejaría en <body> y quien navega con teclado o lector de
 * pantalla tendría que recorrer la página desde el principio. Vuelve a quien
 * lo tenía o, si ya no está, al contenido.
 */
function dismissAndReturnFocus(): void {
    const hadFocus = box.value?.contains(document.activeElement) === true;

    dismiss();

    if (hadFocus) {
        const target = focusedBefore?.isConnected === true ? focusedBefore : document.getElementById(MAIN_ID);

        target?.focus({ preventScroll: true });
    }

    focusedBefore = null;
}
</script>

<template>
    <div
        ref="box"
        :class="
            updateReady
                ? 'fixed inset-x-4 bottom-(--veni-attribution-clearance) z-40 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-veni-md bg-ink py-2 pr-2 pl-4 text-canvas shadow-lg'
                : 'sr-only'
        "
        @focusin="rememberFocus"
    >
        <p role="status" class="flex-1 text-sm font-semibold">
            {{ updateReady ? t('pwa.update_available') : '' }}
        </p>
        <template v-if="updateReady">
            <button
                type="button"
                class="inline-flex min-h-touch items-center rounded-full px-3 text-sm font-semibold hover:underline"
                @click="dismissAndReturnFocus"
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
