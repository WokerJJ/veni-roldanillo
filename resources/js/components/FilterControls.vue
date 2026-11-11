<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, shallowRef, useTemplateRef } from 'vue';

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
 * a la lista. Con `chips` (el celular, #139, ADR 0041), cada control es una
 * píldora en una sola fila que se desplaza de lado bajo el buscador: los
 * mismos controles y la misma lógica, con otro estilo (CSS propio, que baja
 * con la lista y no con el arranque). Si hay más píldoras de un lado, ese
 * borde se desvanece (#147): `more` dice de qué lado.
 */
const { filters, categories, stacked, chips } = defineProps<{
    filters: Readonly<Filters>;
    categories: readonly RestaurantCategory[];
    stacked?: boolean;
    chips?: boolean;
}>();

const emit = defineEmits<{
    'update:filters': [filters: Filters];
}>();

const { t, locale } = useI18n();

function update(changes: Partial<Filters>): void {
    emit('update:filters', { ...filters, ...changes });
}

/** De qué lado hay más píldoras fuera de la vista: el borde de ese lado se desvanece (#147). */
const row = useTemplateRef<HTMLElement>('row');
const more = shallowRef<{ start: boolean; end: boolean }>({ start: false, end: false });

function measure(): void {
    const element = row.value;

    if (!chips || !element) {
        return;
    }

    const start = element.scrollLeft > 1;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;

    if (start !== more.value.start || end !== more.value.end) {
        more.value = { start, end };
    }
}

let resizes: ResizeObserver | undefined;

onMounted(() => {
    measure();

    if (chips && row.value && typeof ResizeObserver !== 'undefined') {
        resizes = new ResizeObserver(measure);
        resizes.observe(row.value);
    }
});

// Otro filtro elegido cambia el ancho de su píldora; llegan las categorías.
onUpdated(measure);

onBeforeUnmount(() => {
    resizes?.disconnect();
});

function onSelect(event: Event, key: 'price' | 'category'): void {
    const { value } = event.target as HTMLSelectElement;

    update(key === 'price' ? { price: value === '' ? null : Number(value) } : { category: value === '' ? null : value });
}
</script>

<template>
    <div
        ref="row"
        class="pt-1 text-sm"
        :class="chips ? 'filter-chips' : stacked ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'flex flex-wrap items-center gap-x-4 gap-y-1'"
        :data-chips="chips || undefined"
        :data-more-start="(chips && more.start) || undefined"
        :data-more-end="(chips && more.end) || undefined"
        @scroll.passive="measure"
    >
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

<style scoped>
/*
 * Los filtros en píldoras (#139): una fila que se desplaza de lado, sin barra
 * a la vista (el dedo y el foco la desplazan: cada control es enfocable y el
 * navegador lo lleva a la vista). Una píldora marcada lleva el borde y el
 * peso del texto, no solo el color.
 */
.filter-chips {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    /* Hasta el borde de lo que se desplaza (la lista lleva 0,5 rem a cada lado), sin pasarse. */
    margin-inline: -0.5rem;
    padding-inline: 0.5rem;
    scrollbar-width: none;
}

/*
 * Con más píldoras de un lado, ese borde se desvanece en 2 rem (#147): una
 * máscara, sin nada encima que reciba toques. No se anima (nada se mueve con
 * «Reducir movimiento»). Con una píldora enfocada con el teclado no hay
 * máscara: el navegador la lleva a la vista y su anillo se ve entero.
 */
.filter-chips[data-more-start],
.filter-chips[data-more-end] {
    --fade-start: 0rem;
    --fade-end: 0rem;
    mask-image: linear-gradient(to right, transparent, #000 var(--fade-start), #000 calc(100% - var(--fade-end)), transparent);
}

.filter-chips[data-more-start] {
    --fade-start: 2rem;
}

.filter-chips[data-more-end] {
    --fade-end: 2rem;
}

.filter-chips:has(:focus-visible) {
    mask-image: none;
}

.filter-chips::-webkit-scrollbar {
    display: none;
}

.filter-chips > label {
    flex-shrink: 0;
    gap: 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 9999px;
    padding-inline: 0.75rem;
    white-space: nowrap;
}

.filter-chips > label:has(:checked),
.filter-chips > label:has(select option:checked:not([value=''])) {
    border-color: currentColor;
    font-weight: 600;
}

/* El menú es el objetivo táctil: 44 px de alto, como la píldora. */
.filter-chips select {
    min-height: var(--veni-touch-min);
    border: 0;
    background: transparent;
    font-weight: 600;
}
</style>
