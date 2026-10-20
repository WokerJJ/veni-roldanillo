<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';

/**
 * Créditos (#58, ADR 0021): la atribución a OpenStreetMap y su licencia
 * (ODbL), qué se toma de allí y cómo pedir la parte de la base que viene de
 * OpenStreetMap. Pública y sin props: todo el texto sale de lang/.
 */
const { t } = useI18n();

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const REQUEST_URL = 'https://github.com/WokerJJ/veni-roldanillo/issues/new';

const linkClass = 'inline-flex min-h-touch items-center gap-1 font-semibold underline';
</script>

<template>
    <Head :title="t('credits.title')" />

    <div class="mx-auto w-full max-w-3xl px-4 pt-2 pb-10">
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('restaurant.back_to_map') }}
        </Link>

        <h1 class="mt-2 text-2xl leading-tight min-[480px]:text-3xl">{{ t('credits.title') }}</h1>
        <p class="mt-3 max-w-prose">{{ t('credits.intro') }}</p>

        <section class="mt-8 border-t border-line pt-6" aria-labelledby="creditos-osm" data-osm>
            <h2 id="creditos-osm" class="text-xl">{{ t('credits.osm_heading') }}</h2>
            <p class="mt-3 max-w-prose">{{ t('credits.osm_body') }}</p>
            <p class="mt-3 max-w-prose">{{ t('credits.osm_import') }}</p>
            <p class="mt-3 max-w-prose">{{ t('credits.osm_license') }}</p>
            <ul class="mt-2">
                <li>
                    <a :href="OSM_COPYRIGHT_URL" target="_blank" rel="noopener noreferrer" :class="linkClass" data-osm-copyright>
                        {{ t('credits.osm_attribution') }}
                        <span class="sr-only">{{ t('credits.opens_new_tab') }}</span>
                    </a>
                </li>
                <li>
                    <a :href="ODBL_URL" target="_blank" rel="noopener noreferrer" :class="linkClass" data-odbl>
                        {{ t('credits.osm_license_link') }}
                        <span class="sr-only">{{ t('credits.opens_new_tab') }}</span>
                    </a>
                </li>
            </ul>
        </section>

        <section class="mt-8 border-t border-line pt-6" aria-labelledby="creditos-pedir" data-request>
            <h2 id="creditos-pedir" class="text-xl">{{ t('credits.request_heading') }}</h2>
            <p class="mt-3 max-w-prose">{{ t('credits.request_body') }}</p>
            <a :href="REQUEST_URL" target="_blank" rel="noopener noreferrer" :class="['mt-2', linkClass]" data-request-link>
                {{ t('credits.request_link') }}
                <span class="sr-only">{{ t('credits.opens_new_tab') }}</span>
            </a>
        </section>

        <section class="mt-8 border-t border-line pt-6" aria-labelledby="creditos-otros">
            <h2 id="creditos-otros" class="text-xl">{{ t('credits.others_heading') }}</h2>
            <ul class="mt-3 max-w-prose">
                <li class="mt-2">{{ t('credits.maplibre') }}</li>
                <li class="mt-2">{{ t('credits.icons') }}</li>
                <li class="mt-2">{{ t('credits.fonts') }}</li>
            </ul>
        </section>
    </div>
</template>
