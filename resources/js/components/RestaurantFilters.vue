<script setup lang="ts">
import { computed, useId } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import type { RestaurantCategory } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { hasFilters, MAX_QUERY_LENGTH, NO_FILTERS } from '@/restaurants/filterParams';

/**
 * El buscador y los filtros del inicio (#12), dentro de la lista. No filtra:
 * emite los filtros nuevos y quien la muestra (Home.vue) los aplica a la
 * lista y al mapa a la vez, y los escribe en la dirección.
 *
 * Los filtros van en un <details> nativo, cerrado al abrir la lista salvo que
 * ya haya alguno puesto: así el panel a media altura deja ver resultados.
 */
const { filters, categories } = defineProps<{
    filters: Readonly<Filters>;
    categories: readonly RestaurantCategory[];
}>();

const emit = defineEmits<{
    'update:filters': [filters: Filters];
}>();

const { t } = useI18n();
const searchId = useId();

/** Los filtros puestos además del buscador: se cuentan en el rótulo de «Filtros». */
const activeCount = computed(() => [filters.open, filters.delivery, filters.price !== null, filters.category !== null].filter(Boolean).length);

const PRICE_LEVELS = [1, 2, 3, 4];

// Fijo al montar: si siguiera a los filtros, sacar el último cerraría el panel bajo el dedo.
const startOpen = activeCount.value > 0;

function update(changes: Partial<Filters>): void {
    emit('update:filters', { ...filters, ...changes });
}

function onSelect(event: Event, key: 'price' | 'category'): void {
    const { value } = event.target as HTMLSelectElement;

    update(key === 'price' ? { price: value === '' ? null : Number(value) } : { category: value === '' ? null : value });
}
</script>

<template>
    <div>
        <label :for="searchId" class="text-sm text-ink-muted">{{ t('finder.search_label') }}</label>
        <div class="relative mt-1">
            <Icon name="buscar" :size="20" class="pointer-events-none absolute top-3 left-3 text-ink-muted" />
            <input
                :id="searchId"
                type="search"
                enterkeyhint="search"
                autocomplete="off"
                :maxlength="MAX_QUERY_LENGTH"
                :value="filters.query"
                class="min-h-touch w-full rounded-full border border-line bg-canvas pr-4 pl-10"
                data-search
                @input="update({ query: ($event.target as HTMLInputElement).value })"
            >
        </div>

        <details class="mt-2" :open="startOpen" data-filters>
            <summary class="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-full px-2 font-semibold hover:bg-surface">
                <Icon name="filtro" :size="20" />
                {{ activeCount > 0 ? t('finder.filters_active', { count: activeCount }) : t('finder.filters') }}
            </summary>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                <label class="inline-flex min-h-touch items-center gap-2">
                    <input type="checkbox" class="size-5" :checked="filters.open" data-filter="open" @change="update({ open: !filters.open })">
                    {{ t('finder.open_now') }}
                </label>
                <label class="inline-flex min-h-touch items-center gap-2">
                    <input type="checkbox" class="size-5" :checked="filters.delivery" data-filter="delivery" @change="update({ delivery: !filters.delivery })">
                    {{ t('finder.delivery') }}
                </label>
                <label class="inline-flex min-h-touch items-center gap-2">
                    {{ t('finder.price') }}
                    <select class="min-h-touch rounded-veni-sm border border-line bg-canvas px-2" data-filter="price" @change="onSelect($event, 'price')">
                        <option value="" :selected="filters.price === null">{{ t('finder.price_any') }}</option>
                        <option v-for="level in PRICE_LEVELS" :key="level" :value="level" :selected="filters.price === level">
                            {{ t('finder.price_up_to', { level: '$'.repeat(level) }) }}
                        </option>
                    </select>
                </label>
                <label v-if="categories.length > 0" class="inline-flex min-h-touch items-center gap-2">
                    {{ t('finder.category') }}
                    <select class="min-h-touch rounded-veni-sm border border-line bg-canvas px-2" data-filter="category" @change="onSelect($event, 'category')">
                        <option value="" :selected="filters.category === null">{{ t('finder.category_any') }}</option>
                        <option v-for="category in categories" :key="category.slug" :value="category.slug" :selected="filters.category === category.slug">
                            {{ category.name }}
                        </option>
                    </select>
                </label>
            </div>
        </details>

        <button
            v-if="hasFilters(filters)"
            type="button"
            class="mt-1 inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface"
            data-clear-filters
            @click="emit('update:filters', { ...NO_FILTERS })"
        >
            <Icon name="cerrar" :size="20" />
            {{ t('finder.clear') }}
        </button>
    </div>
</template>
