<script setup lang="ts">
import FilterControls from '@/components/FilterControls.vue';
import Icon from '@/components/Icon.vue';
import RestaurantSearch from '@/components/RestaurantSearch.vue';
import { useI18n } from '@/composables/useI18n';
import type { RestaurantCategory } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { hasFilters, NO_FILTERS } from '@/restaurants/filterParams';

/**
 * El buscador y los filtros del inicio (#12) en el celular, dentro de la
 * lista. No filtra: emite los filtros nuevos y quien la muestra (Home.vue)
 * los aplica a la lista y al mapa a la vez, y los escribe en la dirección.
 *
 * Los filtros van como píldoras en una fila que se desplaza de lado, bajo el
 * buscador (#139, ADR 0041): siempre a la vista y en una sola línea, así el
 * panel deja ver resultados. Antes iban en un <details> cerrado. Son los
 * mismos controles que la barra de computador (FilterControls, con `chips`).
 * «Quitar filtros» va debajo, con algo puesto (también solo la búsqueda).
 *
 * En la barra lateral de computador (#130) la lista no usa este componente:
 * pone el buscador (RestaurantSearch) fijo arriba y los controles
 * (FilterControls) en su panel, al principio de lo que se desplaza.
 */
const { filters, categories } = defineProps<{
    filters: Readonly<Filters>;
    categories: readonly RestaurantCategory[];
}>();

const emit = defineEmits<{
    'update:filters': [filters: Filters];
}>();

const { t } = useI18n();
</script>

<template>
    <div>
        <RestaurantSearch :filters="filters" @update:filters="emit('update:filters', $event)" />

        <FilterControls
            chips
            role="group"
            :aria-label="t('finder.filters')"
            class="mt-2"
            :filters="filters"
            :categories="categories"
            data-filters
            @update:filters="emit('update:filters', $event)"
        />

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
