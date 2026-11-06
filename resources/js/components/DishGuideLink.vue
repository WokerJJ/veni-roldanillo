<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import { useI18n } from '@/composables/useI18n';

/**
 * El enlace a la guía de platos típicos (#21), en el pie de las páginas y en
 * la bienvenida del celular, donde la cabecera no muestra su navegación. En
 * computador la guía va solo en la navegación de la cabecera (#130): la barra
 * lateral no la repite. Baja aparte del arranque, con los documentos legales
 * (components/links.ts): en el arranque no cabía ni un enlace más.
 */
const { t } = useI18n();
</script>

<template>
    <Link href="/dishes" class="inline-flex min-h-touch items-center self-start underline" data-dish-guide-link>
        {{ t('layout.dish_guide_link') }}
    </Link>
</template>
