<script setup lang="ts">
import { Link } from '@inertiajs/vue3';

import { useI18n } from '@/composables/useI18n';
import { LEGAL_DOCUMENTS } from '@/legal/documents';

/**
 * Los documentos legales (#23, ADR 0030) en una navegación con nombre: el pie
 * de las páginas con pie lleva los tres; la bienvenida del inicio, los dos
 * primeros (`short`). Baja aparte del arranque (AppLayout y Home lo piden con
 * import()); los créditos, al lado, sí van en el arranque.
 */
const { short } = defineProps<{ short?: boolean }>();

const { t } = useI18n();

const LINKS = short ? LEGAL_DOCUMENTS.slice(0, 2) : LEGAL_DOCUMENTS;
</script>

<template>
    <nav :aria-label="t('legal.nav_label')" data-legal-links>
        <ul class="flex flex-wrap gap-x-4">
            <li v-for="link in LINKS" :key="link.href">
                <Link :href="link.href" class="inline-flex min-h-touch items-center underline" :data-legal-link="link.key">{{ t(link.label) }}</Link>
            </li>
        </ul>
    </nav>
</template>
