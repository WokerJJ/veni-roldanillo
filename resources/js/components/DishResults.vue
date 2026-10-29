<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { computed, useId } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import { withinFilters } from '@/restaurants/dishSearch';
import { restaurantUrl } from '@/restaurants/links';
import { useDishSearch } from '@/restaurants/useDishSearch';

/**
 * «Platos» en la lista del inicio (#17, ADR 0029): con tres letras o más en
 * el buscador, los platos que responden, agrupados por restaurante. Cada
 * plato lleva a la ficha; el nombre del restaurante lo elige en el mapa, como
 * una fila de la lista.
 *
 * Los resultados vienen del servidor (useDishSearch), y se muestran solo los
 * de restaurantes que cumplen los demás filtros (`allowed`: abierto ahora,
 * domicilio, precio, tipo de comida), calculados en el dispositivo.
 *
 * Lo que pasó se anuncia una vez por búsqueda, cuando llega la respuesta (no
 * mientras se teclea ni mientras carga): la región de estado se escribe solo
 * con el resultado ya resuelto.
 */
const { query, allowed = null } = defineProps<{
    /** Lo que se escribió en el buscador. */
    query: string;
    /** Los slugs que cumplen los demás filtros, o null si no hay que filtrar. */
    allowed?: ReadonlySet<string> | null;
}>();

defineEmits<{ select: [slug: string] }>();

const { t, locale } = useI18n();
const headingId = useId();
const { status, results, searched, retry } = useDishSearch(
    () => query,
    () => locale.value,
);

const groups = computed(() => withinFilters(results.value, allowed));
const count = computed(() => groups.value.reduce((total, group) => total + group.dishes.length, 0));

/** Lo que se lee al llegar la respuesta; vacío mientras carga. */
const message = computed(() => {
    switch (status.value) {
        case 'done':
            return count.value > 0
                ? t('dishes.count', { count: count.value })
                : t(results.value.length > 0 ? 'dishes.none_filtered' : 'dishes.none', { query: searched.value });
        case 'offline':
            return t('dishes.offline');
        case 'unavailable':
            return t('dishes.unavailable');
        case 'error':
            return t('dishes.error');
        default:
            return '';
    }
});
</script>

<template>
    <section v-if="status !== 'idle'" :aria-labelledby="headingId" class="mt-2 border-t border-line pt-1" data-dishes>
        <h3 :id="headingId" class="flex min-h-touch items-center px-2 font-semibold">{{ t('dishes.title') }}</h3>

        <p role="status" class="sr-only" data-dishes-status>{{ message }}</p>

        <p v-if="status === 'loading'" class="px-2 pb-2 text-sm text-ink-muted" aria-hidden="true" data-dishes-loading>
            {{ t('dishes.loading') }}
        </p>

        <div v-else-if="status !== 'done' || count === 0" class="px-2 pb-2 text-sm text-ink-muted" aria-hidden="true">
            <p data-dishes-message>{{ message }}</p>
            <button
                v-if="status === 'error' || status === 'offline'"
                type="button"
                class="mt-1 inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold text-ink transition-colors hover:bg-surface"
                data-dishes-retry
                @click="retry"
            >
                {{ t('dishes.retry') }}
            </button>
        </div>

        <ul v-else class="-mx-2" data-dishes-results>
            <li v-for="{ restaurant, dishes } in groups" :key="restaurant.slug" class="mb-1">
                <button
                    type="button"
                    class="flex min-h-touch w-full items-center gap-2 rounded-veni-sm px-2 text-left font-semibold hover:bg-surface"
                    :aria-label="t('dishes.select', { name: restaurant.name })"
                    :data-dish-restaurant="restaurant.slug"
                    @click="$emit('select', restaurant.slug)"
                >
                    <Icon name="ubicacion" :size="20" />
                    {{ restaurant.name }}
                </button>
                <ul>
                    <li v-for="dish in dishes" :key="dish.id">
                        <Link
                            :href="restaurantUrl(restaurant.slug)"
                            class="flex min-h-touch flex-col justify-center rounded-veni-sm py-1 pr-2 pl-9 hover:bg-surface"
                            data-dish
                        >
                            <span class="flex flex-wrap items-center justify-between gap-x-2">
                                <span>{{ dish.name }}</span>
                                <span class="font-semibold" data-price>{{ formatPesos(dish.price, locale) }}</span>
                            </span>
                            <span class="text-sm text-ink-muted">
                                <template v-if="dish.section">{{ dish.section }}</template>
                                <template v-if="!dish.available"><template v-if="dish.section"> · </template>{{ t('dishes.unavailable_today') }}</template>
                            </span>
                        </Link>
                    </li>
                </ul>
            </li>
        </ul>
    </section>
</template>
