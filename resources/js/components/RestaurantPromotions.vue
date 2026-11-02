<script setup lang="ts">
import { useId } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { formatDay } from '@/i18n/intl';
import type { ProfilePromotion } from '@/restaurants/profile';

/**
 * Las promociones vigentes de un restaurante en su ficha (#113, ADR 0034):
 * cada una con su imagen 16:9 del mismo tamaño (o solo el título, si no
 * tiene) y hasta cuándo vale. Una fila que se desliza de lado: no empuja el
 * menú hacia abajo.
 *
 * El título va siempre escrito debajo, así que la imagen lleva `alt` vacío:
 * un lector de pantalla no lo repite.
 *
 * Las imágenes vienen en tres anchos (320, 640 y 1280 px); la tarjeta mide
 * 18 rem, así que el navegador pide la de 320 o la de 640 según la pantalla.
 * Los estilos propios van aquí: viajan con la ficha, no con el arranque.
 */
const { promotions } = defineProps<{ promotions: readonly ProfilePromotion[] }>();

const { t, locale } = useI18n();
const headingId = useId();
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.promotions.title') }}</h2>
        <ul class="promotions mt-2 flex gap-3 px-4 pb-2">
            <li v-for="(promotion, index) in promotions" :key="index" class="promotion shrink-0" data-promotion>
                <img
                    v-if="promotion.image"
                    :src="promotion.image.src"
                    :srcset="promotion.image.srcset"
                    sizes="18rem"
                    width="640"
                    height="360"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="promotion-image bg-surface"
                >
                <p class="mt-1 font-semibold wrap-anywhere">{{ promotion.title }}</p>
                <p class="text-sm text-ink-muted">{{ t('restaurant.promotions.until', { date: formatDay(promotion.ends_at.slice(0, 10), locale) }) }}</p>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.promotions {
    margin-inline: -1rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
}

.promotion {
    width: 18rem;
    scroll-snap-align: start;
}

.promotion-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 0.75rem;
    object-fit: cover;
}
</style>
