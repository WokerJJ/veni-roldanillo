<script setup lang="ts">
import { nextTick } from 'vue';

import { renameDish } from '../catalog';
import DishPriceRow from '../components/DishPriceRow.vue';
import type { Draft, Errors, MenuDish, MenuSection } from '../draft';
import { dishCount, isDishIncomplete, MENU_LIMITS } from '../draft';
import { t } from '../texts';

/**
 * Paso 6: la carta que el dueño dicta, por secciones y platos (ADR 0049). Los
 * platos que vienen del catálogo (bebidas de marca) se marcan en el paso
 * siguiente, pero también se ven y se corrigen aquí. Un plato sin precio no
 * deja avanzar.
 */
const { draft, errors, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    patch: (changes: Partial<Draft>) => void;
}>();

function update(menu: MenuSection[]): void {
    patch({ menu });
}

function changeSection(index: number, changes: Partial<MenuSection>): void {
    update(draft.menu.map((section, current) => (current === index ? { ...section, ...changes } : section)));
}

function changeDish(sectionIndex: number, dishIndex: number, changes: Partial<MenuDish>): void {
    update(
        draft.menu.map((section, current) =>
            current === sectionIndex ? { ...section, dishes: section.dishes.map((dish, position) => (position === dishIndex ? { ...dish, ...changes } : dish)) } : section,
        ),
    );
}

/** Lleva el foco al campo recién creado, cuando Vue ya lo dibujó. */
function focusLater(id: string): void {
    void nextTick(() => document.getElementById(id)?.focus());
}

function addSection(): void {
    update([...draft.menu, { name_es: '', name_en: null, dishes: [{ name_es: '', name_en: null, price: null, is_alcohol: false, catalog_variant_id: null }] }]);
    focusLater(`campo-section-${String(draft.menu.length)}`);
}

function removeSection(index: number): void {
    update(draft.menu.filter((_, current) => current !== index));
}

function addDish(sectionIndex: number): void {
    const dishes = draft.menu[sectionIndex]?.dishes ?? [];

    changeSection(sectionIndex, {
        dishes: [...dishes, { name_es: '', name_en: null, price: null, is_alcohol: false, catalog_variant_id: null }],
    });
    focusLater(`campo-dish-${String(sectionIndex)}-${String(dishes.length)}`);
}

/** Enter en el precio abre otro plato en la misma sección, si todavía cabe. */
function nextDish(sectionIndex: number): void {
    if ((draft.menu[sectionIndex]?.dishes.length ?? 0) < MENU_LIMITS.dishesPerSection) {
        addDish(sectionIndex);
    }
}

function removeDish(sectionIndex: number, dishIndex: number): void {
    const dishes = (draft.menu[sectionIndex]?.dishes ?? []).filter((_, current) => current !== dishIndex);

    if (dishes.length === 0) {
        removeSection(sectionIndex);
    } else {
        changeSection(sectionIndex, { dishes });
    }
}

function onText(event: Event): string {
    return (event.target as HTMLInputElement).value;
}

function missing(dish: MenuDish): boolean {
    return errors.menu !== undefined && isDishIncomplete(dish);
}

function rename(sectionIndex: number, dishIndex: number, name: string): void {
    const dish = draft.menu[sectionIndex]?.dishes[dishIndex];

    if (dish) {
        update(draft.menu.map((section, current) => (current === sectionIndex ? { ...section, dishes: section.dishes.map((candidate, position) => (position === dishIndex ? renameDish(dish, name) : candidate)) } : section)));
    }
}
</script>

<template>
    <div class="step">
        <p class="field__help">{{ t('menu.intro') }}</p>
        <p v-if="errors.menu" class="field__error" role="alert">{{ t(`errors.${errors.menu}`) }}</p>
        <p v-if="draft.menu.length > 0" class="muted">{{ t('menu.count', { dishes: dishCount(draft.menu), sections: draft.menu.length }) }}</p>

        <section v-for="(section, sectionIndex) in draft.menu" :key="sectionIndex" class="menu-section" :aria-label="section.name_es || t('menu.section_name')">
            <div class="menu-section__head">
                <input
                    :id="`campo-section-${String(sectionIndex)}`"
                    class="input"
                    type="text"
                    maxlength="80"
                    enterkeyhint="next"
                    :aria-label="t('menu.section_name')"
                    :placeholder="t('menu.section_name')"
                    :value="section.name_es"
                    @input="(event) => changeSection(sectionIndex, { name_es: onText(event) })"
                >
                <button type="button" class="btn btn--quiet btn--remove" :aria-label="t('menu.remove_section', { name: section.name_es || t('menu.section_name') })" @click="removeSection(sectionIndex)">✕</button>
            </div>

            <ul class="dishes">
                <li v-for="(dish, dishIndex) in section.dishes" :key="dishIndex" class="dish" :class="{ 'dish--missing': missing(dish) }">
                    <p v-if="dish.catalog_variant_id !== null" class="dish__source">{{ t('menu.from_catalog') }}</p>
                    <input
                        :id="`campo-dish-${String(sectionIndex)}-${String(dishIndex)}`"
                        class="input"
                        type="text"
                        maxlength="120"
                        enterkeyhint="next"
                        :aria-label="t('menu.dish_name')"
                        :placeholder="t('menu.dish_name')"
                        :value="dish.name_es"
                        @input="(event) => rename(sectionIndex, dishIndex, onText(event))"
                    >
                    <DishPriceRow
                        :id="`campo-price-${String(sectionIndex)}-${String(dishIndex)}`"
                        class="dish__row--menu"
                        :value="dish.price"
                        :invalid="errors.menu !== undefined && dish.price === null"
                        :remove-name="dish.name_es || t('menu.dish_name')"
                        @price="(price) => changeDish(sectionIndex, dishIndex, { price })"
                        @enter="nextDish(sectionIndex)"
                        @remove="removeDish(sectionIndex, dishIndex)"
                    >
                        <label class="check dish__alcohol">
                            <input class="check__input" type="checkbox" :checked="dish.is_alcohol" @change="(event) => changeDish(sectionIndex, dishIndex, { is_alcohol: (event.target as HTMLInputElement).checked })">
                            <span>{{ t('menu.alcohol') }}</span>
                        </label>
                    </DishPriceRow>
                </li>
            </ul>

            <button type="button" class="btn btn--quiet" :disabled="section.dishes.length >= MENU_LIMITS.dishesPerSection" @click="addDish(sectionIndex)">+ {{ t('menu.add_dish') }}</button>
        </section>

        <p v-if="draft.menu.length === 0" class="muted">{{ t('menu.empty') }}</p>
        <button type="button" class="btn" :disabled="draft.menu.length >= MENU_LIMITS.sections" @click="addSection">+ {{ t('menu.add_section') }}</button>
        <p class="field__help">{{ t('menu.alcohol_help') }}</p>
    </div>
</template>
