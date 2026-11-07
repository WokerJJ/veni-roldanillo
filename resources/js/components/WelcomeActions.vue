<script setup lang="ts">
import { computed, onMounted } from 'vue';

import Icon from '@/components/Icon.vue';
import { PILL } from '@/components/pill';
import { useI18n } from '@/composables/useI18n';
import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { NO_FILTERS } from '@/restaurants/filterParams';
import { opensListFromUrl } from '@/restaurants/finder';
import { useFinderPanel } from '@/restaurants/useFinder';

/**
 * Lo del inicio (#12) que va en la bienvenida, al lado de «Ver la lista»:
 * «Sugerime algo», «Almuerzos de hoy» (si hay) y, con filtros puestos,
 * cuántos los cumplen y «Quitar filtros». Baja con la lista, fuera del
 * arranque (ADR 0022 y 0028): necesita «abierto ahora» para sortear.
 *
 * «Sugerime algo» elige uno al azar entre los abiertos ahora que cumplen los
 * filtros y lo emite como si lo hubieran tocado en el mapa (`select`); si no
 * hay ninguno, lo dice en su región de estado, que se ve, con el que abre
 * primero y un botón para verlo (#138, A1), y pide más alto (`expand`): en el
 * panel asomado el aviso quedaba debajo del borde.
 *
 * Si el inicio se abrió con una búsqueda o filtros en la dirección (#21), al
 * montarse pide abrir la lista (`list`), una sola vez (finder.ts).
 */
const { restaurants, filters = null } = defineProps<{
    restaurants: readonly Restaurant[];
    filters?: Readonly<Filters> | null;
}>();

const emit = defineEmits<{
    select: [slug: string];
    /** Abrir la lista en «Almuerzos de hoy». */
    lunches: [];
    /** Abrir la lista: la dirección traía una búsqueda o filtros. */
    list: [];
    'update:filters': [filters: Filters];
    /** Lo que dice no entra en el panel asomado: que suba. */
    expand: [];
}>();

const { t } = useI18n();
/** Cuáles cumplen los filtros, «Sugerime algo» y la región de estado: lo mismo que la lista (useFinder.ts). */
const { filtered, lunches, announced, next, suggest: pick } = useFinderPanel(
    { restaurants: () => restaurants, filters: () => filters },
    {
        unfiltered: 'silent',
        onFilters: (fixed) => {
            emit('update:filters', fixed);
        },
    },
);
const lunchCount = computed(() => lunches.value.length);

onMounted(() => {
    if (opensListFromUrl(filters)) {
        emit('list');
    }
});

function suggest(): void {
    const slug = pick();

    if (slug === null) {
        emit('expand');
    } else {
        emit('select', slug);
    }
}

</script>

<template>
    <button type="button" :class="PILL" data-suggest @click="suggest">
        <Icon name="estrella" :size="20" />
        {{ t('finder.suggest') }}
    </button>
    <button v-if="lunchCount > 0" type="button" :class="PILL" data-lunches @click="emit('lunches')">
        <Icon name="sancocho" :size="20" />
        {{ t('lunches.title_count', { count: lunchCount }) }}
    </button>
    <button v-if="filtered" type="button" :class="PILL" data-clear-filters @click="emit('update:filters', { ...NO_FILTERS })">
        <Icon name="cerrar" :size="20" />
        {{ t('finder.clear') }}
    </button>
    <!-- Siempre en la página: el lector de pantalla anuncia cuando cambia. -->
    <p role="status" class="basis-full text-sm" data-welcome-status>{{ announced }}</p>
    <button v-if="next" type="button" :class="PILL" data-suggest-next @click="emit('select', next.slug)">
        <Icon name="chevron-derecha" :size="20" />
        {{ t('finder.suggest_view', { name: next.name }) }}
    </button>
</template>
