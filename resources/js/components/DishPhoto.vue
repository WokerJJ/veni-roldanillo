<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import type { ProfileImage } from '@/restaurants/profile';

/**
 * La foto cuadrada de un plato (#113, ADR 0034), del mismo tamaño para
 * todos: la miniatura del menú (`thumb`, 64 px) o la grande del selector
 * (`large`, a lo ancho). Sin foto, el mismo cuadro con un ícono: el menú no
 * se mueve según quién subió foto y quién no.
 *
 * El servidor manda tres anchos (160, 480 y 960 px) en `srcset`; con `sizes`
 * el navegador pide solo el que le sirve (la miniatura, el de 160 en casi
 * cualquier pantalla). `width` y `height` reservan el lugar antes de que
 * llegue, `loading="lazy"` no la pide hasta que se acerca a la vista y
 * `decoding="async"` no frena el resto de la página.
 *
 * `alt` es el nombre del plato. En el menú la miniatura va junto al nombre,
 * dentro del mismo botón: ahí se pasa vacío para que un lector de pantalla
 * no lo diga dos veces.
 *
 * Los estilos van aquí y no con clases de Tailwind que nadie más usa: así
 * viajan con la ficha y no en la hoja de estilos del arranque.
 */
const { image, alt, size } = defineProps<{ image: ProfileImage | null | undefined; alt: string; size: 'thumb' | 'large' }>();

const SIZES = {
    thumb: '64px',
    // El selector ocupa el ancho de la pantalla en un celular y 28 rem en una más grande.
    large: '(min-width: 32rem) 28rem, 100vw',
} as const;
</script>

<template>
    <span
        class="dish-photo block shrink-0 overflow-hidden bg-surface"
        :class="`dish-photo-${size}`"
        :data-photo="image ? 'image' : 'placeholder'"
    >
        <img
            v-if="image"
            :src="image.src"
            :srcset="image.srcset"
            :sizes="SIZES[size]"
            :width="size === 'thumb' ? 64 : 480"
            :height="size === 'thumb' ? 64 : 480"
            :alt="alt"
            loading="lazy"
            decoding="async"
            class="dish-photo-image"
        >
        <span v-else class="dish-photo-image flex items-center justify-center text-ink-muted" aria-hidden="true">
            <Icon name="sancocho" :size="size === 'thumb' ? 28 : 64" />
        </span>
    </span>
</template>

<style scoped>
.dish-photo-thumb {
    width: 4rem;
    height: 4rem;
    border-radius: 0.5rem;
}

.dish-photo-large {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 0.75rem;
}

.dish-photo-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
