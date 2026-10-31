<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import { useI18n } from '@/composables/useI18n';
import { LEGAL_DOCUMENTS } from '@/legal/documents';

/**
 * Los documentos legales (#23, ADR 0030) en una navegación con nombre: el pie
 * de las páginas con pie lleva los tres; la bienvenida del inicio, los dos
 * primeros (`short`). Baja aparte del arranque (AppLayout y Home lo piden con
 * import()); los créditos, al lado, sí van en el arranque.
 *
 * Antes de la navegación va el enlace a la guía de platos típicos (#21), que
 * se muestra en los mismos dos lugares y por eso baja con este chunk: en el
 * arranque no cabía ni un enlace más (resources/js/map/bundle.test.ts). Van
 * sin envoltura, como hijos del contenedor (la fila del pie o la columna de
 * la bienvenida), y los dos reciben la clase que le pongan al componente;
 * los demás atributos no se reenvían: un id o un aria-label quedarían repetidos.
 *
 * Ya no son solo los documentos legales, pero el nombre se queda: el del
 * archivo viaja en el arranque (los import() de AppLayout y Home nombran el
 * chunk) y uno más descriptivo lo pasaba del presupuesto. Medido con
 * bundle.test.ts: SecondaryLinks, 83,001 kB; ExtraLinks, +3 bytes.
 */
defineOptions({ inheritAttrs: false });

const { short } = defineProps<{ short?: boolean }>();

const { t } = useI18n();

const LINKS = short ? LEGAL_DOCUMENTS.slice(0, 2) : LEGAL_DOCUMENTS;
</script>

<template>
    <Link :class="$attrs.class" href="/dishes" class="inline-flex min-h-touch items-center self-start underline" data-dish-guide-link>{{ t('layout.dish_guide_link') }}</Link>
    <nav :class="$attrs.class" :aria-label="t('legal.nav_label')" data-legal-links>
        <ul class="flex flex-wrap gap-x-4">
            <li v-for="link in LINKS" :key="link.href">
                <Link :href="link.href" class="inline-flex min-h-touch items-center underline" :data-legal-link="link.key">{{ t(link.label) }}</Link>
            </li>
        </ul>
    </nav>
</template>
