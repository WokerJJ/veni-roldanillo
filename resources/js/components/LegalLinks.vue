<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import { useI18n } from '@/composables/useI18n';
import { LEGAL_DOCUMENTS } from '@/legal/documents';

/**
 * Los documentos legales (#23, ADR 0030) en una navegación con nombre: el pie
 * de las páginas con pie lleva los tres; la bienvenida del inicio, los dos
 * primeros (`short`). Baja aparte del arranque, con la navegación de la
 * cabecera y la guía de platos (components/links.ts); los créditos, al lado,
 * sí van en el arranque.
 *
 * Con `inline` (la línea chica del pie de la barra lateral, ADR 0037) los
 * rótulos son cortos, para que entren en una línea después de los créditos,
 * y van separados por «·», que el lector de pantalla no lee.
 */
const { short, inline } = defineProps<{ short?: boolean; inline?: boolean }>();

const { t } = useI18n();

const LINKS = short ? LEGAL_DOCUMENTS.slice(0, 2) : LEGAL_DOCUMENTS;

/** En la línea chica el rótulo es corto; el nombre accesible sigue siendo el completo, que lo contiene (WCAG 2.5.3). */
const SHORT = { privacy: 'legal.privacy_short', terms: 'legal.terms_short', reviews: 'legal.reviews_link' } as const;
</script>

<template>
    <nav :aria-label="t('legal.nav_label')" data-legal-links>
        <ul class="flex flex-wrap" :class="inline ? 'gap-x-2' : 'gap-x-4'">
            <li v-for="link in LINKS" :key="link.href" class="flex items-center gap-x-2">
                <span v-if="inline" aria-hidden="true">·</span>
                <Link
                    :href="link.href"
                    class="inline-flex min-h-touch items-center underline"
                    :aria-label="inline ? t(link.label) : undefined"
                    :data-legal-link="link.key"
                >
                    {{ t(inline ? SHORT[link.key] : link.label) }}
                </Link>
            </li>
        </ul>
    </nav>
</template>
