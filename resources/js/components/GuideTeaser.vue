<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import cholado from '../../images/guia/cholado-480.webp';
import empanada from '../../images/guia/empanadas-vallunas-480.webp';
import sancocho from '../../images/guia/sancocho-de-gallina-480.webp';

/**
 * La guía de platos típicos a la vista en el inicio (#143): una tarjeta con
 * tres fotos de platos que lleva a /dishes. La guía es de lo que más se
 * muestra de Vení: no puede ser solo un enlace subrayado en el pie.
 *
 * Baja aparte del arranque, con los demás enlaces (components/links.ts). Los
 * estilos van aquí, con alcance: viajan con la tarjeta y no en la hoja de
 * estilos del arranque. Las fotos son decorativas (el título y la frase ya
 * dicen de qué es la tarjeta); de quién son, en /credits#fotos y en cada
 * tarjeta de la guía. Se piden ya (`eager`): son tres de unos 10 kB, y con
 * `lazy` el panel, que se desplaza por dentro, las dejaba sin pedir.
 */
const { t } = useI18n();

const PHOTOS = [empanada, cholado, sancocho] as const;
</script>

<template>
    <Link href="/dishes" class="guide-teaser" data-guide-teaser>
        <span class="guide-teaser-photos" aria-hidden="true">
            <img v-for="photo in PHOTOS" :key="photo" :src="photo" width="480" height="360" alt="" loading="eager" decoding="async">
        </span>
        <span class="guide-teaser-text">
            <span class="guide-teaser-title">{{ t('layout.dish_guide_link') }}</span>
            <span class="guide-teaser-sub">{{ t('guide.teaser') }}</span>
        </span>
        <Icon name="chevron-derecha" :size="20" class="guide-teaser-arrow" />
    </Link>
</template>

<style scoped>
.guide-teaser {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--veni-touch-min);
    padding: 0.625rem 0.75rem;
    border-radius: var(--veni-radius-md);
    color: var(--color-veni-blanco);
    background: linear-gradient(150deg, var(--color-veni-ciruela) 40%, color-mix(in srgb, var(--color-veni-ciruela) 60%, var(--color-veni-arrebol)));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-veni-blanco) 20%, transparent);
}

/* Tres fotos redondas, montadas una sobre otra. */
.guide-teaser-photos {
    display: flex;
    flex-shrink: 0;
}

.guide-teaser-photos img {
    width: 3rem;
    height: 3rem;
    border-radius: 9999px;
    object-fit: cover;
    background: var(--color-surface);
    box-shadow: 0 0 0 2px var(--color-veni-ciruela);
}

.guide-teaser-photos img + img {
    margin-left: -0.875rem;
}

.guide-teaser-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}

.guide-teaser-title {
    font-weight: 700;
    line-height: 1.25rem;
}

.guide-teaser-sub {
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: color-mix(in srgb, var(--color-veni-blanco) 88%, transparent);
}

.guide-teaser-arrow {
    flex-shrink: 0;
    color: var(--color-veni-mango);
}
</style>
