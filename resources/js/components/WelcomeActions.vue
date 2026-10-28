<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import type { Restaurant } from '@/restaurants/api';
import type { Filters } from '@/restaurants/filterParams';
import { filterRestaurants, hasFilters, NO_FILTERS, pickSuggestion, todaysLunches } from '@/restaurants/finder';

/**
 * Lo del inicio (#12) que va en la bienvenida, al lado de «Ver la lista»:
 * «Sugerime algo», «Almuerzos de hoy» (si hay) y, con filtros puestos,
 * cuántos los cumplen y «Quitar filtros». Baja con la lista, fuera del
 * arranque (ADR 0022 y 0028): necesita «abierto ahora» para sortear.
 *
 * «Sugerime algo» elige uno al azar entre los abiertos ahora que cumplen los
 * filtros y lo emite como si lo hubieran tocado en el mapa (`select`); si no
 * hay ninguno, lo dice en su región de estado.
 */
const { restaurants, filters = null } = defineProps<{
    restaurants: readonly Restaurant[];
    filters?: Readonly<Filters> | null;
}>();

const emit = defineEmits<{
    select: [slug: string];
    /** Abrir la lista en «Almuerzos de hoy». */
    lunches: [];
    'update:filters': [filters: Filters];
}>();

const { t } = useI18n();
const now = useNow();
const filtered = computed(() => filters !== null && hasFilters(filters));
const matching = computed(() => (filters !== null && filtered.value ? filterRestaurants(restaurants, filters, now.value) : restaurants));
const lunchCount = computed(() => todaysLunches(matching.value, now.value).length);
const missed = ref(false);

watch(
    () => filters,
    () => {
        missed.value = false;
    },
);

const message = computed(() => {
    if (missed.value) {
        return filtered.value ? t('finder.suggest_none_filtered') : t('finder.suggest_none');
    }

    if (!filtered.value) {
        return '';
    }

    return matching.value.length === 0 ? t('finder.none') : t('finder.count_filtered', { count: matching.value.length, total: restaurants.length });
});

function suggest(): void {
    const pick = pickSuggestion(matching.value, now.value);

    missed.value = pick === null;

    if (pick !== null) {
        emit('select', pick.slug);
    }
}

const PILL = 'inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 font-semibold transition-colors hover:bg-surface';
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
    <p role="status" class="basis-full text-sm" data-welcome-status>{{ message }}</p>
</template>
