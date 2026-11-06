<script setup lang="ts">
import { computed } from 'vue';

import FilterControls from '@/components/FilterControls.vue';
import Icon from '@/components/Icon.vue';
import RestaurantSearch from '@/components/RestaurantSearch.vue';
import { useI18n } from '@/composables/useI18n';
import type { RestaurantCategory } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { activeFilterCount } from '@/restaurants/filterCount';
import { hasFilters, NO_FILTERS } from '@/restaurants/filterParams';

/**
 * El buscador y los filtros del inicio (#12) en el celular, dentro de la
 * lista. No filtra: emite los filtros nuevos y quien la muestra (Home.vue)
 * los aplica a la lista y al mapa a la vez, y los escribe en la dirección.
 *
 * Los filtros van en un <details> nativo, cerrado al abrir la lista salvo que
 * ya haya alguno puesto: así el panel a media altura deja ver resultados.
 * «Quitar filtros» va fuera, y se ve aunque se cierre.
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

const activeCount = computed(() => activeFilterCount(filters));

// Fijo al montar: si siguiera a los filtros, sacar el último cerraría el panel bajo el dedo.
const startOpen = activeCount.value > 0;
</script>

<template>
    <div>
        <RestaurantSearch :filters="filters" @update:filters="emit('update:filters', $event)" />

        <details class="mt-2" :open="startOpen" data-filters>
            <summary class="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-full px-2 font-semibold hover:bg-surface">
                <Icon name="filtro" :size="20" />
                {{ activeCount > 0 ? t('finder.filters_active', { count: activeCount }) : t('finder.filters') }}
            </summary>
            <FilterControls :filters="filters" :categories="categories" @update:filters="emit('update:filters', $event)" />
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
