<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';

/**
 * La guía de platos típicos (#21): qué es cada plato o bebida del Valle,
 * cuándo se come y una nota para quien viene de visita. El texto lo manda el
 * servidor (DishGuideController, desde lang/{idioma}/guide.php), ya en el
 * idioma de la petición, como los documentos legales (ADR 0030); aquí solo
 * se arma la página: la introducción, el índice con anclas y los platos.
 *
 * Cada plato enlaza al inicio con la búsqueda puesta (/?q=…, #12 y #17): la
 * guía no llama a la API; busca el inicio, con lo que haya abierto hoy.
 */
export interface GuideDish {
    id: string;
    name: string;
    /** Lo que se busca en el inicio: en español en los dos idiomas. */
    search: string;
    summary: string;
    when: string;
    tip: string;
}

export interface GuideSection {
    id: string;
    heading: string;
    dishes: GuideDish[];
}

export interface DishGuide {
    title: string;
    intro: string;
    note: string;
    labels: { toc: string; when: string; tip: string; search_link: string };
    sections: GuideSection[];
}

const { guide } = defineProps<{ guide: DishGuide }>();

const { t } = useI18n();

/** Los id llevan prefijo: no chocan con los de la página (#contenido). */
function anchor(id: string): string {
    return `guia-${id}`;
}

/**
 * El inicio con la búsqueda del plato, como la escribe la barra de búsqueda
 * (`FILTER_PARAMS.query` en restaurants/filterParams.ts). El literal no se
 * importa de allí: ese módulo baja con la lista, y traerlo sumaría un chunk a
 * las dependencias de esta página en el registro de páginas del arranque.
 * DishGuide.test.ts fija que los dos coinciden.
 */
function searchHref(dish: GuideDish): string {
    return `/?q=${encodeURIComponent(dish.search)}`;
}

const linkClass = 'inline-flex min-h-touch items-center underline underline-offset-4';
</script>

<template>
    <Head :title="guide.title" />

    <article class="mx-auto w-full max-w-3xl px-4 pt-2 pb-10" aria-labelledby="guia-titulo" data-dish-guide>
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('restaurant.back_to_map') }}
        </Link>

        <h1 id="guia-titulo" class="mt-2 text-2xl leading-tight min-[480px]:text-3xl">{{ guide.title }}</h1>
        <p class="mt-3 max-w-prose">{{ guide.intro }}</p>
        <p class="mt-3 max-w-prose text-sm text-ink-muted" data-note>{{ guide.note }}</p>

        <nav class="mt-6 rounded-veni-sm border border-line px-4 py-3" aria-labelledby="guia-indice" data-toc>
            <h2 id="guia-indice" class="text-lg">{{ guide.labels.toc }}</h2>
            <ul class="mt-1">
                <li v-for="section in guide.sections" :key="section.id" class="mt-2">
                    <a :href="`#${anchor(section.id)}`" :class="['font-semibold', linkClass]">{{ section.heading }}</a>
                    <ul class="list-disc pl-8">
                        <li v-for="dish in section.dishes" :key="dish.id">
                            <a :href="`#${anchor(dish.id)}`" :class="linkClass">{{ dish.name }}</a>
                        </li>
                    </ul>
                </li>
            </ul>
        </nav>

        <section
            v-for="section in guide.sections"
            :id="anchor(section.id)"
            :key="section.id"
            class="mt-8 border-t border-line pt-6"
            :aria-labelledby="`${anchor(section.id)}-titulo`"
            data-section
        >
            <h2 :id="`${anchor(section.id)}-titulo`" class="text-xl">{{ section.heading }}</h2>

            <article
                v-for="dish in section.dishes"
                :id="anchor(dish.id)"
                :key="dish.id"
                class="mt-6"
                :aria-labelledby="`${anchor(dish.id)}-titulo`"
                :data-dish="dish.id"
            >
                <h3 :id="`${anchor(dish.id)}-titulo`" class="text-lg">{{ dish.name }}</h3>
                <p class="mt-2 max-w-prose">{{ dish.summary }}</p>
                <dl class="mt-2 max-w-prose">
                    <dt class="font-semibold">{{ guide.labels.when }}</dt>
                    <dd>{{ dish.when }}</dd>
                    <dt class="mt-2 font-semibold">{{ guide.labels.tip }}</dt>
                    <dd>{{ dish.tip }}</dd>
                </dl>
                <!-- El nombre del plato completa el del enlace: hay uno por plato (WCAG 2.4.4). -->
                <Link :href="searchHref(dish)" :class="['mt-1 gap-1 font-semibold', linkClass]" data-search-link>
                    <Icon name="buscar" :size="20" />
                    {{ guide.labels.search_link }}<span class="sr-only">: {{ dish.name }}</span>
                </Link>
            </article>
        </section>
    </article>
</template>
