<script setup lang="ts">
import ChoiceChip from '../components/ChoiceChip.vue';
import TextField from '../components/TextField.vue';
import type { Draft, Errors } from '../draft';
import type { MetaCache } from '../storage';
import { currentLocale, t } from '../texts';

/** Paso 1: el nombre y el tipo de comida (hasta 5 categorías). */
const { draft, errors, meta, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    meta: MetaCache | null;
    patch: (changes: Partial<Draft>) => void;
}>();

const MAX_CATEGORIES = 5;

function categoryName(category: { name_es: string; name_en: string }): string {
    return currentLocale() === 'en' ? category.name_en : category.name_es;
}

function toggle(id: number, on: boolean): void {
    const without = draft.categoryIds.filter((current) => current !== id);

    patch({ categoryIds: on ? [...without, id].slice(0, MAX_CATEGORIES) : without });
}
</script>

<template>
    <div class="step">
        <TextField id="campo-name" :label="t('fields.name')" :value="draft.name" :error="errors.name ?? ''" :maxlength="120" autocomplete="organization" @input="(value) => patch({ name: value })" />

        <fieldset class="group" :aria-describedby="errors.categories ? 'campo-categories-error' : 'campo-categories-help'">
            <legend class="group__legend">{{ t('fields.categories') }}</legend>
            <p id="campo-categories-help" class="field__help">{{ t('fields.categories_help') }}</p>
            <div class="choices">
                <ChoiceChip
                    v-for="category in meta?.categories ?? []"
                    :key="category.id"
                    type="checkbox"
                    name="categories"
                    :value="String(category.id)"
                    :label="categoryName(category)"
                    :checked="draft.categoryIds.includes(category.id)"
                    @change="(on) => toggle(category.id, on)"
                />
            </div>
            <p v-if="errors.categories" id="campo-categories-error" class="field__error" role="alert">{{ t(`errors.${errors.categories}`) }}</p>
        </fieldset>
    </div>
</template>
