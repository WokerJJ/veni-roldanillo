<script setup lang="ts">
import { computed, ref } from 'vue';

import type { CatalogGroup, CatalogItem, CatalogVariant } from '../catalog';
import { brandsOf, dishesOfGroup, EMPTY_CATALOG, formatPesos, isSelected, parsePrice, removeDish, setDishPrice, setLabelPrice, toggleVariant } from '../catalog';
import ChoiceChip from '../components/ChoiceChip.vue';
import PriceInput from '../components/PriceInput.vue';
import type { Draft, Errors, MenuDish } from '../draft';
import type { MetaCache } from '../storage';
import { currentLocale, t } from '../texts';

/**
 * Paso 7: bebidas de marca y otros paquetes que se repiten, del catálogo
 * (ADR 0049). Se toca el grupo y la marca, se marcan los productos y sus
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
const bulk = ref<Record<string, string>>({});

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
    const price = parsePrice(bulk.value[label] ?? '');

    if (group_ && price !== null) {
        patch({ menu: setLabelPrice(draft.menu, group_, label, price) });
    }
}

function setPrice(dish: MenuDish, price: number | null): void {
    patch({ menu: setDishPrice(draft.menu, dish, price) });
}

function sizeName(label: string): string {
    return label === '' ? t('catalog.no_size') : label;
}

function onBulk(label: string, event: Event): void {
    bulk.value = { ...bulk.value, [label]: (event.target as HTMLInputElement).value };
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
                <h3 id="campo-prices-title" class="step__title">{{ t('catalog.prices_title', { n: chosen.length }) }}</h3>

                <div v-for="size in sizes" :key="size" class="size">
                    <div class="size__head">
                        <h4>{{ sizeName(size) }}</h4>
                        <div class="size__bulk">
                            <input
                                class="input input--price"
                                type="text"
                                inputmode="numeric"
                                autocomplete="off"
                                :aria-label="t('catalog.bulk_label', { size: sizeName(size) })"
                                :placeholder="t('catalog.bulk_placeholder')"
                                :value="bulk[size] ?? ''"
                                @input="(event) => onBulk(size, event)"
                            >
                            <button type="button" class="btn" :disabled="parsePrice(bulk[size] ?? '') === null" @click="applyBulk(size)">{{ t('catalog.bulk_apply') }}</button>
                        </div>
                    </div>

                    <ul class="dishes">
                        <li v-for="entry in chosen.filter((candidate) => candidate.label === size)" :key="entry.dish.name_es" class="dish" :class="{ 'dish--missing': errors.menu !== undefined && entry.dish.price === null }">
                            <p class="dish__name">{{ entry.dish.name_es }}</p>
                            <div class="dish__row">
                                <PriceInput :id="`campo-cprice-${entry.dish.name_es}`" :label="t('menu.dish_price')" :value="entry.dish.price" :invalid="errors.menu !== undefined && entry.dish.price === null" @input="(price) => setPrice(entry.dish, price)" />
                                <span v-if="entry.dish.price !== null" class="muted">{{ formatPesos(entry.dish.price) }}</span>
                                <button type="button" class="btn btn--quiet" :aria-label="t('menu.remove_dish', { name: entry.dish.name_es })" @click="patch({ menu: removeDish(draft.menu, entry.dish) })">✕</button>
                            </div>
                        </li>
                    </ul>
                </div>
            </section>
        </template>
    </div>
</template>
