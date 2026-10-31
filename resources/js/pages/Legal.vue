<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

import Icon from '@/components/Icon.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';

/**
 * Un documento legal (#23, ADR 0030): la política de tratamiento de datos,
 * los términos de uso o la política de reseñas. El texto lo manda el servidor
 * (LegalDocumentController, desde lang/{idioma}/documents.php), ya en el
 * idioma de la petición; aquí solo se arma la página: versión y fecha, el
 * aviso de borrador, la tabla de contenido con anclas y las secciones.
 */
export type LegalDocumentKey = 'privacy' | 'terms' | 'reviews';

export type LegalBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

export interface LegalSection {
    id: string;
    heading: string;
    blocks: LegalBlock[];
}

export interface LegalDocument {
    key: LegalDocumentKey;
    title: string;
    intro: string;
    version: string;
    effective_date: string;
    effective_date_label: string;
    sections: LegalSection[];
}

const { document, draft, contactEmail, related } = defineProps<{
    document: LegalDocument;
    draft: boolean;
    contactEmail: string;
    related: { key: LegalDocumentKey; href: string }[];
}>();

const { t } = useI18n();

/** El nombre corto de cada documento, para enlazarlo. */
const LINK_KEYS: Record<LegalDocumentKey, TranslationKey> = {
    privacy: 'legal.privacy_link',
    terms: 'legal.terms_link',
    reviews: 'legal.reviews_link',
};

/** Los id de las secciones llevan prefijo: no chocan con los de la página (#contenido). */
function anchor(section: LegalSection): string {
    return `${document.key}-${section.id}`;
}

const linkClass = 'inline-flex min-h-touch items-center font-semibold underline underline-offset-4';
</script>

<template>
    <Head :title="document.title" />

    <article class="mx-auto w-full max-w-3xl px-4 pt-2 pb-10" :data-legal="document.key" aria-labelledby="documento-titulo">
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('layout.back_to_map') }}
        </Link>

        <h1 id="documento-titulo" class="mt-2 text-2xl leading-tight min-[480px]:text-3xl">{{ document.title }}</h1>
        <p class="mt-2 text-sm text-ink-muted" data-version>
            {{ t('legal.version', { version: document.version, date: document.effective_date_label }) }}
        </p>

        <div v-if="draft" role="note" aria-labelledby="documento-borrador" class="mt-4 rounded-veni-sm border-2 border-line px-4 py-3" data-draft>
            <p id="documento-borrador" class="font-semibold">{{ t('legal.draft_title') }}</p>
            <p class="mt-1 text-sm">{{ t('legal.draft_body') }}</p>
        </div>

        <p class="mt-4 max-w-prose">{{ document.intro }}</p>

        <nav class="mt-6 rounded-veni-sm border border-line px-4 py-3" aria-labelledby="documento-indice" data-toc>
            <h2 id="documento-indice" class="text-lg">{{ t('legal.toc') }}</h2>
            <!-- Las secciones no van numeradas: viñetas, como las listas del texto. -->
            <ul class="mt-1 list-disc pl-8">
                <li v-for="section in document.sections" :key="section.id">
                    <a :href="`#${anchor(section)}`" class="inline-flex min-h-touch items-center underline underline-offset-4">{{ section.heading }}</a>
                </li>
            </ul>
        </nav>

        <section
            v-for="section in document.sections"
            :id="anchor(section)"
            :key="section.id"
            class="mt-8 border-t border-line pt-6"
            :aria-labelledby="`${anchor(section)}-titulo`"
            data-section
        >
            <h2 :id="`${anchor(section)}-titulo`" class="text-xl">{{ section.heading }}</h2>
            <template v-for="(block, index) in section.blocks" :key="index">
                <p v-if="block.kind === 'paragraph'" class="mt-3 max-w-prose">{{ block.text }}</p>
                <ul v-else class="mt-3 max-w-prose list-disc pl-8">
                    <li v-for="(item, itemIndex) in block.items" :key="itemIndex" class="mt-2">{{ item }}</li>
                </ul>
            </template>
        </section>

        <p class="mt-8 max-w-prose border-t border-line pt-6" data-contact>
            {{ t('legal.contact') }}
            <a :href="`mailto:${contactEmail}`" class="font-semibold underline underline-offset-4 wrap-anywhere">{{ contactEmail }}</a>
        </p>

        <nav class="mt-6" aria-labelledby="documento-otros" data-related>
            <h2 id="documento-otros" class="text-lg">{{ t('legal.related') }}</h2>
            <ul class="mt-1">
                <li v-for="link in related" :key="link.key">
                    <Link :href="link.href" :class="linkClass">{{ t(LINK_KEYS[link.key]) }}</Link>
                </li>
                <li>
                    <Link href="/credits" :class="linkClass">{{ t('credits.link') }}</Link>
                </li>
            </ul>
        </nav>
    </article>
</template>
