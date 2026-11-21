<script setup lang="ts">
import { computed, ref } from 'vue';

import type { CatalogGroup, CatalogItem, CatalogVariant } from '../catalog';
import { brandsOf, dishesOfGroup, EMPTY_CATALOG, isSelected, removeDish, setDishPrice, setLabelPrice, toggleVariant } from '../catalog';
import ChoiceChip from '../components/ChoiceChip.vue';
import DishPriceRow from '../components/DishPriceRow.vue';
import PriceInput from '../components/PriceInput.vue';
import type { Draft, Errors, MenuDish } from '../draft';
import { isDishIncomplete } from '../draft';
import type { MetaCache } from '../storage';
import { currentLocale, t } from '../texts';

/**
 * Paso 7: bebidas de marca y otros paquetes que se repiten, del catálogo
 * (ADR 0050). Se toca el grupo y la marca, se marcan los productos y sus
 * presentaciones, y los precios se ponen por tamaño («todas las de 400 ml:
 * $3.500») y se ajustan plato por plato. Una sola pasada crea todos los
 * platos de su sección. El catálogo viaja en el teléfono: funciona sin señal.
 */
const { draft, errors, meta, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    meta: MetaCache | null;
    patch: (changes: Partial<Draft>) => void;
}>();

const catalog = computed(() => meta?.catalog ?? EMPTY_CATALOG);
const groupId = ref<number | null>(null);
const brandKey = ref<string | null | undefined>(undefined);
const bulk = ref<Record<string, number | null>>({});
/** A cuántos platos se aplicó el último precio por tamaño, por tamaño (se anuncia a quien usa lector de pantalla). */
const applied = ref<Record<string, number>>({});

const group = computed<CatalogGroup | null>(() => catalog.value.groups.find((candidate) => candidate.id === groupId.value) ?? catalog.value.groups[0] ?? null);
const brands = computed(() => (group.value ? brandsOf(group.value) : []));
/** Con una sola marca (o ninguna) no se pregunta por la marca: se ven todos los productos. */
const askBrand = computed(() => brands.value.length > 1);
const shownBrand = computed<string | null>(() => (brandKey.value !== undefined && brands.value.includes(brandKey.value) ? brandKey.value : (brands.value[0] ?? null)));
const items = computed<CatalogItem[]>(() => (group.value?.items ?? []).filter((item) => !askBrand.value || item.brand === shownBrand.value));
const chosen = computed(() => (group.value ? dishesOfGroup(draft.menu, group.value) : []));

/** Los tamaños de los platos marcados del grupo, en el orden en que salen. */
const sizes = computed(() => [...new Set(chosen.value.map((entry) => entry.label))]);

function name(entry: { name_es: string; name_en: string | null }): string {
    return currentLocale() === 'en' && entry.name_en ? entry.name_en : entry.name_es;
}

function brandLabel(brand: string | null): string {
    return brand ?? t('catalog.no_brand');
}

function selectGroup(next: CatalogGroup): void {
    groupId.value = next.id;
    brandKey.value = undefined;
}

function toggle(item: CatalogItem, variant: CatalogVariant | null, on: boolean): void {
    if (group.value) {
        patch({ menu: toggleVariant(draft.menu, group.value, item, variant, on) });
    }
}

function applyBulk(label: string): void {
    const group_ = group.value;
    const price = bulk.value[label] ?? null;

    if (group_ && price !== null) {
        patch({ menu: setLabelPrice(draft.menu, group_, label, price) });
        applied.value = { ...applied.value, [label]: chosen.value.filter((entry) => entry.label === label).length };
        bulk.value = { ...bulk.value, [label]: null };
    }
}

function appliedText(label: string): string {
    const n = applied.value[label];

    if (n === undefined) {
        return '';
    }

    return n === 1 ? t('catalog.bulk_applied_one') : t('catalog.bulk_applied', { n });
}

/** Lleva a la lista de precios sin tocar la dirección (un ancla cambiaría el hash y la pantalla del asistente). */
function jumpToPrices(): void {
    const title = document.getElementById('campo-prices-title');

    if (title) {
        title.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        title.focus({ preventScroll: true });
    }
}

function setPrice(dish: MenuDish, price: number | null): void {
    patch({ menu: setDishPrice(draft.menu, dish, price) });
}

function sizeName(label: string): string {
    return label === '' ? t('catalog.no_size') : label;
}

function onBulk(label: string, price: number | null): void {
    bulk.value = { ...bulk.value, [label]: price };
    applied.value = Object.fromEntries(Object.entries(applied.value).filter(([key]) => key !== label));
}
</script>

<template>
    <div class="step">
        <p class="field__help">{{ t('catalog.intro') }}</p>
        <p v-if="errors.menu" class="field__error" role="alert">{{ t(`errors.${errors.menu}`) }}</p>

        <p v-if="catalog.groups.length === 0" class="notice" role="status">{{ t('catalog.empty') }}</p>

        <template v-if="group">
            <fieldset class="group">
                <legend class="group__legend">{{ t('catalog.groups') }}</legend>
                <div class="choices">
                    <button v-for="candidate in catalog.groups" :key="candidate.id" type="button" class="chip" :aria-pressed="candidate.id === group.id" @click="selectGroup(candidate)">{{ name(candidate) }}</button>
                </div>
            </fieldset>

            <p v-if="group.is_alcohol" class="notice" role="note">{{ t('catalog.alcohol_notice') }}</p>

            <fieldset v-if="askBrand" class="group">
                <legend class="group__legend">{{ t('catalog.brands') }}</legend>
                <div class="choices">
                    <button v-for="brand in brands" :key="brand ?? ''" type="button" class="chip" :aria-pressed="brand === shownBrand" @click="brandKey = brand">{{ brandLabel(brand) }}</button>
                </div>
            </fieldset>

            <button v-if="chosen.length > 0" type="button" class="btn btn--tonal" @click="jumpToPrices">{{ t('catalog.jump_prices', { n: chosen.length }) }}</button>

            <section v-for="item in items" :key="item.id" class="catalog-item" :aria-label="name(item)">
                <h3 class="catalog-item__name">{{ name(item) }}<span v-if="item.is_alcohol || group.is_alcohol" class="plus18" aria-hidden="true">+18</span></h3>
                <div class="choices">
                    <ChoiceChip
                        v-for="variant in item.variants"
                        :key="variant.id"
                        type="checkbox"
                        :name="`catalog-${String(item.id)}`"
                        :value="String(variant.id)"
                        :label="variant.label"
                        :checked="isSelected(draft.menu, group, item, variant)"
                        @change="(on) => toggle(item, variant, on)"
                    />
                    <ChoiceChip
                        v-if="item.variants.length === 0"
                        type="checkbox"
                        :name="`catalog-${String(item.id)}`"
                        :value="String(item.id)"
                        :label="t('catalog.add_item')"
                        :checked="isSelected(draft.menu, group, item, null)"
                        @change="(on) => toggle(item, null, on)"
                    />
                </div>
            </section>

            <section v-if="chosen.length > 0" class="prices" aria-labelledby="campo-prices-title">
                <h3 id="campo-prices-title" class="step__title" tabindex="-1">{{ t('catalog.prices_title', { n: chosen.length }) }}</h3>

                <div v-for="size in sizes" :key="size" class="size">
                    <div class="size__head">
                        <h4>{{ sizeName(size) }}</h4>
                        <div class="size__bulk">
                            <PriceInput
                                :id="`campo-bulk-${size}`"
                                :label="t('catalog.bulk_label', { size: sizeName(size) })"
                                :placeholder="t('catalog.bulk_placeholder')"
                                :value="bulk[size] ?? null"
                                @input="(price) => onBulk(size, price)"
                                @enter="applyBulk(size)"
                            />
                            <button type="button" class="btn" :disabled="(bulk[size] ?? null) === null" @click="applyBulk(size)">{{ t('catalog.bulk_apply') }}</button>
                        </div>
                        <p class="field__help" role="status">{{ appliedText(size) }}</p>
                    </div>

                    <ul class="dishes">
                        <li v-for="entry in chosen.filter((candidate) => candidate.label === size)" :key="entry.dish.name_es" class="dish" :class="{ 'dish--missing': errors.menu !== undefined && isDishIncomplete(entry.dish) }">
                            <p class="dish__name">{{ entry.dish.name_es }}</p>
                            <DishPriceRow
                                :id="`campo-cprice-${entry.dish.name_es}`"
                                :value="entry.dish.price"
                                :invalid="errors.menu !== undefined && entry.dish.price === null"
                                :remove-name="entry.dish.name_es"
                                @price="(price) => setPrice(entry.dish, price)"
                                @remove="patch({ menu: removeDish(draft.menu, entry.dish) })"
                            />
                        </li>
                    </ul>
                </div>
            </section>
        </template>
    </div>
</template>
