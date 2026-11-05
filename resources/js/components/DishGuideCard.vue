<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { useId } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';

/**
 * La guía de platos típicos (#21): en la barra lateral de computador (ADR
 * 0037), una tarjeta compacta de una línea, con el ícono `empanada`, justo
 * debajo del subtítulo; con `link`, el enlace de siempre del pie de las
 * páginas y de la bienvenida del celular. Baja aparte del arranque, con los
 * documentos legales (components/links.ts): en el arranque no cabía ni un
 * enlace más.
 *
 * La explicación de la tarjeta no entra en el nombre del enlace (que es el de
 * la guía): es su descripción (`aria-describedby`) y no se ve, para que la
 * tarjeta quede en una línea.
 */
const { link } = defineProps<{ link?: boolean }>();

const { t } = useI18n();
const descriptionId = useId();
</script>

<template>
    <Link v-if="link" href="/dishes" class="inline-flex min-h-touch items-center self-start underline" data-dish-guide-link>
        {{ t('layout.dish_guide_link') }}
    </Link>
    <div v-else>
        <Link
            href="/dishes"
            class="flex min-h-touch items-center gap-3 rounded-veni-md border border-line bg-surface px-3 py-1"
            :aria-describedby="descriptionId"
            data-dish-guide-card
        >
            <span class="shrink-0 rounded-full bg-veni-mango p-1.5 text-veni-ciruela"><Icon name="empanada" :size="20" /></span>
            <span class="min-w-0 flex-1 truncate font-semibold underline underline-offset-4">{{ t('layout.dish_guide_link') }}</span>
            <Icon name="chevron-derecha" class="shrink-0" />
        </Link>
        <span :id="descriptionId" hidden>{{ t('home.guide_card_text') }}</span>
    </div>
</template>
