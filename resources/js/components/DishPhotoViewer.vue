<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useModalDialog } from '@/composables/useModalDialog';
import type { ProfileImage } from '@/restaurants/profile';

/**
 * La foto de un plato a pantalla completa (#126, ADR 0034). La abre el
 * selector (DishPicker) al tocar la foto grande y viaja en su chunk: no pesa
 * en la ficha ni en el arranque. `name` es el nombre del plato: el del
 * diálogo («Foto de …») y el texto alternativo de la foto.
 *
 * Es otro <dialog> modal (useModalDialog), encima del selector: showModal()
 * lo pone arriba de todo, deja inerte lo de abajo (el selector incluido) y
 * Escape lo cierra a él solo, no al selector. Se cierra también con «Cerrar»
 * (44 px), con un toque en el fondo, fuera de la foto, o si el navegador lo
 * cierra por su cuenta. El foco va a «Cerrar», el único control, y Tab no lo
 * deja salir; al cerrar, el selector lo devuelve a la foto.
 *
 * La foto pide el ancho que le sirve: el lado corto de la pantalla
 * (`sizes`), que en un celular de densidad 2 o 3 o en un computador es el de
 * 960 px. El cuadro tiene su tamaño antes de que llegue: no salta.
 */
const { image, name } = defineProps<{ image: ProfileImage; name: string }>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const closeButton = useTemplateRef<HTMLButtonElement>('close');
/** Si el último toque empezó en el fondo: arrastrar desde la foto y soltar afuera no cierra (BUG-042). */
let pressedOnBackdrop = false;

useModalDialog(dialog, {
    onDismiss: () => {
        emit('close');
    },
});

function onPointerDown(event: PointerEvent): void {
    pressedOnBackdrop = event.target === dialog.value;
}

/** Un toque en el fondo (el margen alrededor de la foto o el telón) cierra, como en el selector; en la foto, no. */
function onClick(event: MouseEvent): void {
    const fromBackdrop = pressedOnBackdrop;
    pressedOnBackdrop = false;

    if (fromBackdrop && event.target === dialog.value) {
        emit('close');
    }
}

/** El único control es «Cerrar»: Tab y Mayús+Tab se quedan en él. */
function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
        event.preventDefault();
        closeButton.value?.focus();
    }
}

onMounted(() => {
    closeButton.value?.focus();
});
</script>

<template>
    <dialog
        ref="dialog"
        class="photo-viewer text-ink"
        :aria-label="t('order.picker.photo_viewer', { name })"
        data-photo-viewer
        @pointerdown="onPointerDown"
        @click="onClick"
        @keydown="onKeydown"
    >
        <img
            :src="image.src"
            :srcset="image.srcset"
            sizes="(min-aspect-ratio: 1/1) 100vh, 100vw"
            width="960"
            height="960"
            :alt="name"
            decoding="async"
            class="photo-viewer-image"
        >
        <button
            ref="close"
            type="button"
            class="photo-viewer-close inline-flex size-touch items-center justify-center rounded-full bg-surface"
            :aria-label="t('order.picker.close')"
            data-viewer-close
            @click="emit('close')"
        >
            <Icon name="cerrar" :size="20" />
        </button>
    </dialog>
</template>

<style scoped>
/* Como en DishPicker: estilos propios, en el chunk del selector y no en la hoja del arranque. */
/* Ocupa la ventana sin la barra de desplazamiento de la página (100vw la incluye). */
.photo-viewer {
    inset: 0;
    width: auto;
    max-width: none;
    height: auto;
    max-height: none;
    margin: 0;
    padding: 1rem;
    border: 0;
    background: var(--color-canvas);
}

.photo-viewer[open] {
    display: flex;
    align-items: center;
    justify-content: center;
}

.photo-viewer::backdrop {
    background: rgb(0 0 0 / 0.5);
}

/* Cuadrada, lo más grande que entre con el margen y lejos de «Cerrar» arriba. */
.photo-viewer-image {
    width: min(100%, 100dvh - 7rem);
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--veni-radius-md);
    object-fit: cover;
    background: var(--color-surface);
}

.photo-viewer-close {
    position: absolute;
    top: max(0.75rem, env(safe-area-inset-top));
    right: max(0.75rem, env(safe-area-inset-right));
}

@media (prefers-reduced-motion: no-preference) {
    .photo-viewer[open] {
        animation: photo-viewer-in 150ms ease-out;
    }
}

@keyframes photo-viewer-in {
    from {
        opacity: 0;
    }
}
</style>
