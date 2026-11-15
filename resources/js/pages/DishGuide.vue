<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

import { computed } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { photoCredit } from '@/guide/photoCredits';
import { guidePhoto } from '@/guide/photos';
import { LICENSES } from '@/guide/photoCredits';
import { dishIcon } from '@/icons/food';

/**
 * La guía de platos típicos (#21): qué es cada plato o bebida del Valle,
 * cuándo se come y una nota para quien viene de visita. El texto lo manda el
 * servidor (DishGuideController, desde lang/{idioma}/guide.php), ya en el
 * idioma de la petición, como los documentos legales (ADR 0030); aquí solo
 * se arma la página (#143, M14): una portada con un mosaico de fotos, las
 * secciones como chips que llevan a cada una y los platos, cada uno en su
 * tarjeta con su foto (o su ícono grande, si todavía no tiene), qué es,
 * cuándo se come y «Dónde lo sirven hoy». Las fotos tienen licencia abierta
 * (guide/photoCredits.ts, ADR 0045): el autor y la licencia van en cada tarjeta.
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

/** Cuántos platos y bebidas tiene la guía. */
const count = computed(() => guide.sections.reduce((total, section) => total + section.dishes.length, 0));

/** Las fotos de la portada: las seis primeras de la guía, en su orden. */
const mosaic = computed(() =>
    guide.sections
        .flatMap((section) => section.dishes)
        .flatMap((dish) => {
            const photo = guidePhoto(dish.id);

            return photo === null ? [] : [{ id: dish.id, photo }];
        })
        .slice(0, 6),
);

/** Quién hizo la foto de un plato y con qué licencia, para la tarjeta; null sin foto. */
function creditText(id: string): string | null {
    const credit = photoCredit(id);

    return credit === null ? null : t('guide.photo_credit', { author: credit.author, license: LICENSES[credit.license].label });
}

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

</script>

<template>
    <Head :title="guide.title" />

    <article class="mx-auto w-full max-w-5xl px-4 pt-2 pb-10" aria-labelledby="guia-titulo" data-dish-guide>
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('layout.back_to_map') }}
        </Link>

        <!--
            La portada (#143): lo que más se ve de Vení. El color de la marca,
            cuántos platos hay, el título y un mosaico con sus fotos. Las fotos
            son decorativas: cada plato tiene su nombre más abajo.
        -->
        <header class="guide-hero mt-2" data-hero>
            <p class="guide-count" data-count>{{ t('guide.count', { count }) }}</p>
            <h1 id="guia-titulo" class="guide-title">{{ guide.title }}</h1>
            <p class="guide-intro">{{ guide.intro }}</p>
            <ul v-if="mosaic.length > 0" class="guide-mosaic" aria-hidden="true" data-mosaic>
                <li v-for="(item, index) in mosaic" :key="item.id">
                    <img
                        :src="item.photo.src"
                        :srcset="item.photo.srcset"
                        sizes="(min-width: 64rem) 9rem, 30vw"
                        width="960"
                        height="720"
                        alt=""
                        :loading="index < 3 ? 'eager' : 'lazy'"
                        decoding="async"
                        class="guide-mosaic-photo"
                    >
                </li>
            </ul>
        </header>
        <p class="mt-4 max-w-prose text-sm text-ink-muted" data-note>{{ guide.note }}</p>

        <!--
            Las secciones como chips (#143, M14): una fila que se desplaza de
            lado y se queda arriba al bajar, bajo la cabecera chica del celular
            (ADR 0041). Cada plato sigue teniendo su ancla (/dishes#guia-…).
        -->
        <nav class="guide-chips" :aria-label="guide.labels.toc" data-toc>
            <ul class="flex gap-2">
                <li v-for="section in guide.sections" :key="section.id" class="shrink-0">
                    <a :href="`#${anchor(section.id)}`" class="guide-chip inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold whitespace-nowrap">
                        {{ section.heading }}
                    </a>
                </li>
            </ul>
        </nav>

        <section
            v-for="section in guide.sections"
            :id="anchor(section.id)"
            :key="section.id"
            class="guide-section mt-8"
            :aria-labelledby="`${anchor(section.id)}-titulo`"
            tabindex="-1"
            data-section
        >
            <h2 :id="`${anchor(section.id)}-titulo`" class="text-2xl">{{ section.heading }}</h2>

            <div class="guide-cards mt-4">
                <article
                    v-for="dish in section.dishes"
                    :id="anchor(dish.id)"
                    :key="dish.id"
                    class="guide-card"
                    :aria-labelledby="`${anchor(dish.id)}-titulo`"
                    :data-dish="dish.id"
                >
                    <!-- La foto, o el ícono del plato (en español en los dos idiomas, ADR 0036) si todavía no tiene: decorativos, el nombre va debajo. -->
                    <figure class="guide-figure">
                        <img
                            v-if="guidePhoto(dish.id)"
                            :src="guidePhoto(dish.id)?.src"
                            :srcset="guidePhoto(dish.id)?.srcset"
                            sizes="(min-width: 64rem) 20rem, (min-width: 40rem) 45vw, calc(100vw - 2rem)"
                            width="960"
                            height="720"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            class="guide-photo"
                            data-dish-photo
                        >
                        <span v-else class="guide-photo guide-photo-icon" data-dish-icon>
                            <Icon :name="dishIcon(dish.id)" :size="64" />
                        </span>
                        <figcaption v-if="creditText(dish.id)" class="guide-credit" data-photo-credit>{{ creditText(dish.id) }}</figcaption>
                    </figure>

                    <div class="guide-body">
                        <h3 :id="`${anchor(dish.id)}-titulo`" class="text-xl leading-snug wrap-anywhere">{{ dish.name }}</h3>
                        <p class="mt-2 wrap-anywhere" data-summary>{{ dish.summary }}</p>
                        <dl class="mt-3 text-sm">
                            <dt class="font-semibold">{{ guide.labels.when }}</dt>
                            <dd class="text-ink-muted">{{ dish.when }}</dd>
                            <dt class="mt-2 font-semibold">{{ guide.labels.tip }}</dt>
                            <dd class="text-ink-muted">{{ dish.tip }}</dd>
                        </dl>
                        <!-- El nombre del plato completa el del enlace: hay uno por plato (WCAG 2.4.4). -->
                        <Link
                            :href="searchHref(dish)"
                            class="mt-4 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                            data-search-link
                        >
                            <Icon name="buscar" :size="20" />
                            {{ guide.labels.search_link }}<span class="sr-only">: {{ dish.name }}</span>
                        </Link>
                    </div>
                </article>
            </div>
        </section>
    </article>
</template>

<style scoped>
/*
 * CSS propio de la guía, no utilidades nuevas de Tailwind: el de Tailwind
 * baja con el arranque (ADR 0020) y este, con la página.
 */

/* La portada: el color de la marca con un toque cálido, siempre oscuro (el texto va en blanco, 8:1 o más). */
.guide-hero {
    padding: 1.25rem;
    border-radius: var(--veni-radius-lg);
    color: var(--color-veni-blanco);
    background: linear-gradient(150deg, var(--color-veni-ciruela) 40%, color-mix(in srgb, var(--color-veni-ciruela) 60%, var(--color-veni-arrebol)));
}

.guide-count {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    background: var(--color-veni-mango);
    color: var(--color-veni-ciruela);
    font-size: 0.875rem;
    font-weight: 700;
}

.guide-title {
    margin-top: 0.75rem;
    font-size: 2rem;
    line-height: 1.1;
    color: var(--color-veni-blanco);
}

@media (min-width: 40rem) {
    .guide-title {
        font-size: 2.75rem;
    }
}

.guide-intro {
    margin-top: 0.75rem;
    max-width: 40rem;
    color: color-mix(in srgb, var(--color-veni-blanco) 92%, transparent);
}

/* El mosaico: tres fotos por fila en el celular, seis en una sola desde 1024 px. */
.guide-mosaic {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin-top: 1.25rem;
}

@media (min-width: 64rem) {
    .guide-mosaic {
        grid-template-columns: repeat(6, minmax(0, 1fr));
    }
}

.guide-mosaic-photo {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--veni-radius-sm);
}

/* Los chips: una fila que se desplaza de lado, sólida, bajo la cabecera chica del celular (ADR 0041). */
.guide-chips {
    position: sticky;
    top: calc(env(safe-area-inset-top, 0px) + var(--veni-touch-min) + 1px);
    z-index: 20;
    margin: 1.5rem -1rem 0;
    padding: 0.25rem 1rem;
    overflow-x: auto;
    background: var(--color-canvas);
    border-bottom: 1px solid var(--color-line);
    scrollbar-width: none;
}

.guide-chips::-webkit-scrollbar {
    display: none;
}

.guide-chip:hover {
    background: var(--color-surface);
}

/* Al saltar a una sección, su título no queda bajo la cabecera chica ni los chips. */
.guide-section {
    scroll-margin-top: calc(env(safe-area-inset-top, 0px) + var(--veni-touch-min) + 4rem);
}

.guide-section :deep([id]) {
    scroll-margin-top: calc(env(safe-area-inset-top, 0px) + var(--veni-touch-min) + 4rem);
}

/* Una columna en el celular; dos desde 640 px y tres desde 1024 px. */
.guide-cards {
    display: grid;
    gap: 1.25rem;
}

@media (min-width: 40rem) {
    .guide-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (min-width: 64rem) {
    .guide-cards {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}

/* La tarjeta: sólida (el contenido no es de vidrio), con la foto arriba hasta el borde. */
.guide-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: var(--veni-radius-md);
    background: var(--color-canvas);
}

.guide-figure {
    position: relative;
}

.guide-photo {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--color-surface);
}

/* Sin foto: el ícono grande, en el color de la marca. */
.guide-photo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-ink);
}

/* El autor y la licencia (la que pide CC BY): sobre la foto, abajo, en blanco sobre un degradado oscuro. */
.guide-credit {
    position: absolute;
    inset: auto 0 0;
    padding: 1.25rem 0.75rem 0.375rem;
    color: #fff;
    font-size: 0.75rem;
    line-height: 1rem;
    background: linear-gradient(to top, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.45) 60%, transparent);
}

.guide-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 1rem;
}

.guide-body :deep(dl) {
    flex: 1;
}
</style>
