<script setup lang="ts">
import { computed } from 'vue';

import Icon from '@/components/Icon.vue';
import { dishIcon } from '@/icons/food';
import type { ProfileImage } from '@/restaurants/profile';

/**
 * La foto cuadrada de un plato (#113, ADR 0034), igual para todos los
 * platos en cada lugar: `thumb`, la miniatura del menú (64 px en el celular
 * y 96 px desde 1024 px, #126), y `large`, la grande del selector, a lo
 * ancho de la hoja (4:3, #141).
 *
 * Sin foto sale el mismo cuadro con un ícono, así el menú no se mueve según
 * quién subió foto y quién no. El ícono sale del nombre del plato en español
 * (`name`, el `name_es` de la ficha si viaja: BUG-025, #115, ADR 0036) para
 * que no cambie con el idioma: el plato típico de colombia-icons si lo nombra
 * («Sancocho de gallina») y, si no, el tazón genérico. Es decorativo: el
 * nombre ya está escrito al lado.
 *
 * El servidor manda tres anchos (192, 480 y 960 px) en `srcset` y `sizes`
 * dice cuánto ocupa la foto: la miniatura pide la de 192 (o la de 480 en
 * densidad 3 con 96 px) y la grande, la de 480 o la de 960. `width` y
 * `height` reservan el lugar antes de que llegue, `loading="lazy"` no la pide
 * hasta que se acerca a la vista y `decoding="async"` no frena el resto de la
 * página.
 *
 * `alt` es el nombre del plato. En el menú la miniatura va junto al nombre,
 * dentro del mismo botón: ahí se pasa vacío para que un lector de pantalla
 * no lo diga dos veces.
 *
 * Los estilos van aquí y no con clases de Tailwind que nadie más usa: así
 * viajan con la ficha y no en la hoja de estilos del arranque.
 */
const { image, name, alt, size } = defineProps<{ image: ProfileImage | null | undefined; name: string; alt: string; size: 'thumb' | 'large' }>();

const placeholder = computed(() => dishIcon(name));

const SIZES = {
    // 96 px desde 1024 px (la ficha en dos columnas, ADR 0038), 64 px antes.
    thumb: '(min-width: 1024px) 96px, 64px',
    // La hoja del selector mide 32 rem como mucho y la foto va de borde a borde (#141, M9).
    large: '(min-width: 32rem) 32rem, 100vw',
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
            <Icon :name="placeholder" :size="size === 'thumb' ? 28 : 64" />
        </span>
    </span>
</template>

<style scoped>
.dish-photo-thumb {
    width: 4rem;
    height: 4rem;
    border-radius: var(--veni-radius-sm);
}

/* La del detalle del plato (#141, M9): de borde a borde de la hoja, 4:3, sin pasar del 40 % del alto para no tapar las opciones. */
.dish-photo-large {
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 40dvh;
}

/* En computador la carta tiene lugar: la miniatura crece y el ícono con ella (#126). */
@media (min-width: 1024px) {
    .dish-photo-thumb {
        width: 6rem;
        height: 6rem;
    }

    .dish-photo-thumb svg {
        width: 2.5rem;
        height: 2.5rem;
    }
}

.dish-photo-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
