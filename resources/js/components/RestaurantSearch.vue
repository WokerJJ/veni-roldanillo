<script setup lang="ts">
import { useId } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import type { Filters } from '@/restaurants/filterParams';
import { MAX_QUERY_LENGTH } from '@/restaurants/filterParams';

/**
 * El buscador del inicio (#12), sin los filtros: RestaurantFilters lo pone
 * arriba de su <details> en el celular y la lista, fijo arriba, en la barra
 * lateral de computador (#130). No busca: emite los filtros con el texto
 * nuevo y quien la muestra (Home.vue) los aplica.
 */
const { filters } = defineProps<{
    filters: Readonly<Filters>;
}>();

const emit = defineEmits<{
    'update:filters': [filters: Filters];
}>();

const { t } = useI18n();
const searchId = useId();

function search(query: string): void {
    emit('update:filters', { ...filters, query });
}

/**
 * Escape con texto vacía el buscador y se queda ahí: sin el preventDefault,
 * el inicio cerraría la lista (Home.vue). Vacío, sigue de largo y la cierra.
 * Sin el modificador `.esc`: su ayudante de Vue viajaría con el arranque.
 */
function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || filters.query === '') {
        return;
    }

    event.preventDefault();
    search('');
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
                @input="search(($event.target as HTMLInputElement).value)"
                @keydown="onKeydown"
            >
        </div>
    </div>
</template>
