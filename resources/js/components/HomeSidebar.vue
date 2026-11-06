<script setup lang="ts">
import { useTemplateRef } from 'vue';

import RestaurantList from '@/components/RestaurantList.vue';
import RestaurantSummary from '@/components/RestaurantSummary.vue';
import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';

/**
 * Lo de la barra lateral de computador (ADR 0037) que no hace falta para el
 * primer pintado: la lista siempre abierta (sin cerrar ni tomar el foco), con
 * el buscador, «Sugerime algo», «Quitar filtros» y el botón de los filtros
 * fijos arriba y lo demás (el panel de los filtros, los almuerzos, las filas,
 * los favoritos) en la única parte que se desplaza, y el resumen del elegido
 * debajo de su fila. Baja con la lista, fuera del arranque; el título, el
 * subtítulo, el estado y la línea de los créditos los pone el inicio
 * (Home.vue).
 *
 * El slot es lo de «Cómo llegar» que va dentro del resumen (RouteDirections,
 * que baja aparte al pedir la primera ruta).
 */
const { filters = null, distances = null, selected = null } = defineProps<{
    restaurants: readonly Restaurant[];
    filters?: Readonly<Filters> | null;
    distances?: Readonly<Record<string, number>> | null;
    /** El elegido, desde la lista o desde el mapa. */
    selected?: Restaurant | null;
    directionsOpen: boolean;
    routeOffline: boolean;
}>();

const emit = defineEmits<{
    select: [slug: string];
    'update:filters': [filters: Filters];
    close: [];
    directions: [];
    closeDirections: [];
    retryDirections: [];
}>();

const list = useTemplateRef<{ focusItem: (slug: string) => void }>('list');

defineExpose({
    /** Lleva el foco al botón de ese restaurante en la lista (al cerrar su resumen); si no está, al título de la lista. */
    focusItem(slug: string): void {
        list.value?.focusItem(slug);
    },
});
</script>

<template>
    <RestaurantList
        ref="list"
        class="mt-2"
        pinned-finder
        :restaurants="restaurants"
        :filters="filters"
        :distances="distances"
        :selected="selected?.slug ?? null"
        @update:filters="emit('update:filters', $event)"
        @select="emit('select', $event)"
    >
        <template #selected="{ restaurant, inRow }">
            <RestaurantSummary
                :key="restaurant.slug"
                :restaurant="restaurant"
                :in-row="inRow"
                :directions-open="directionsOpen"
                :route-offline="routeOffline"
                @close="emit('close')"
                @directions="emit('directions')"
                @close-directions="emit('closeDirections')"
                @retry-directions="emit('retryDirections')"
            >
                <slot />
            </RestaurantSummary>
        </template>
    </RestaurantList>
</template>
