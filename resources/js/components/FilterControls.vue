<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { RestaurantCategory } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { PRICE_CAPS } from '@/restaurants/filterParams';

/**
 * Los filtros del buscador (abierto ahora, domicilios, «platos hasta $X» y
 * tipo de comida), sin el buscador ni lo que los abre: RestaurantFilters los pone
 * dentro de su <details> en el celular; en la barra lateral de computador
 * (#130), la lista los pone sueltos al principio de lo que se desplaza, como
 * el panel de su botón «Filtros». Con `stacked`, el rótulo de cada menú
 * va arriba: los dos menús entran en una fila y el panel le quita menos alto
 * a la lista.
 */
const { filters, categories, stacked } = defineProps<{
    filters: Readonly<Filters>;
    categories: readonly RestaurantCategory[];
    stacked?: boolean;
}>();

const emit = defineEmits<{
    'update:filters': [filters: Filters];
}>();

const { t, locale } = useI18n();

function update(changes: Partial<Filters>): void {
    emit('update:filters', { ...filters, ...changes });
}

function onSelect(event: Event, key: 'price' | 'category'): void {
    const { value } = event.target as HTMLSelectElement;

    update(key === 'price' ? { price: value === '' ? null : Number(value) } : { category: value === '' ? null : value });
}
</script>

<template>
    <div class="pt-1 text-sm" :class="stacked ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'flex flex-wrap items-center gap-x-4 gap-y-1'">
        <label class="inline-flex min-h-touch items-center gap-2">
            <input type="checkbox" class="size-5" :checked="filters.open" data-filter="open" @change="update({ open: !filters.open })">
            {{ t('finder.open_now') }}
        </label>
        <label class="inline-flex min-h-touch items-center gap-2">
            <input type="checkbox" class="size-5" :checked="filters.delivery" data-filter="delivery" @change="update({ delivery: !filters.delivery })">
            {{ t('finder.delivery') }}
        </label>
        <label :class="stacked ? 'flex min-w-0 flex-col gap-1' : 'inline-flex min-h-touch items-center gap-2'">
            {{ t('finder.price') }}
            <select class="min-h-touch rounded-veni-sm border border-line bg-canvas px-2" :class="{ 'w-full': stacked }" data-filter="price" @change="onSelect($event, 'price')">
                <option value="" :selected="filters.price === null">{{ t('finder.price_any') }}</option>
                <option v-for="cap in PRICE_CAPS" :key="cap" :value="cap" :selected="filters.price === cap">
                    {{ t('finder.price_up_to', { price: formatPesos(cap, locale) }) }}
                </option>
            </select>
        </label>
        <label v-if="categories.length > 0" :class="stacked ? 'flex min-w-0 flex-col gap-1' : 'inline-flex min-h-touch items-center gap-2'">
            {{ t('finder.category') }}
            <select class="min-h-touch rounded-veni-sm border border-line bg-canvas px-2" :class="{ 'w-full': stacked }" data-filter="category" @change="onSelect($event, 'category')">
                <option value="" :selected="filters.category === null">{{ t('finder.category_any') }}</option>
                <option v-for="category in categories" :key="category.slug" :value="category.slug" :selected="filters.category === category.slug">
                    {{ category.name }}
                </option>
            </select>
        </label>
    </div>
</template>
