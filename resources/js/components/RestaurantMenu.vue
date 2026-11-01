<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId } from 'vue';

import type DishPickerComponent from '@/components/DishPicker.vue';
import MenuDishLine from '@/components/MenuDishLine.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatPesos } from '@/i18n/intl';
import { blockingIngredient, ingredientEffects } from '@/order/ingredients';
import type { OrderItem } from '@/order/selection';
import { isOrderable, isSoldOut, MAX_QUANTITY } from '@/order/selection';
import { useOrder } from '@/order/useOrder';
import { businessDay } from '@/restaurants/openStatus';
import type { MenuDish, MenuSection } from '@/restaurants/profile';

/**
 * El menú de un restaurante en su ficha (#13): por secciones, con el precio
 * de cada plato en pesos. El orden es el del restaurante y llega resuelto del
 * servidor, que tampoco manda los platos que el dueño sacó del menú ni las
 * secciones que quedaron vacías. Un plato «agotado hoy» sigue en la lista,
 * con su aviso: mañana vuelve.
 *
 * Si un plato está agotado hoy se calcula aquí, con la fecha que manda el
 * servidor y el día de Colombia: la ficha puede quedar abierta de un día para
 * otro, y el aviso se va solo a la medianoche.
 *
 * Con `slug`, cada plato que se puede pedir hoy es un botón que abre su
 * selector (#14, ADR 0023): opciones, adiciones, quitar, nota y cantidad.
 * «Agregar» lo deja en el pedido del restaurante (useOrder), que mostrará y
 * enviará el carrito (#15). Un plato agotado, o con un grupo obligatorio sin
 * opciones suficientes, no se puede agregar.
 *
 * Los ingredientes agotados hoy (#112, ADR 0033) también se calculan aquí,
 * con el mismo reloj: sin uno esencial, el plato sale «No disponible hoy ·
 * sin X»; sin uno que no lo es, «Hoy sin X» u «Hoy con Y en lugar de X».
 */
const { sections, slug = null } = defineProps<{ sections: readonly MenuSection[]; slug?: string | null }>();

/**
 * El selector baja recién al tocar un plato: no pesa en la ficha. Se importa
 * a mano y no con defineAsyncComponent, que sumaría su código al chunk de
 * Vue, el del arranque (resources/js/map/bundle.test.ts).
 */
const DishPicker = shallowRef<typeof DishPickerComponent | null>(null);

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();

const today = computed(() => businessDay(now.value).date);

const order = slug === null ? null : useOrder(slug);
/** El plato del selector abierto. */
const picking = shallowRef<MenuDish | null>(null);
/** El botón que lo abrió: el foco vuelve ahí al cerrar. */
let opener: HTMLElement | null = null;
const announcement = ref('');

function soldOut(dish: MenuDish): boolean {
    return isSoldOut(dish, today.value);
}

function canOrder(dish: MenuDish): boolean {
    return order !== null && isOrderable(dish, today.value);
}

/** El ingrediente esencial que hoy no hay, o null. */
function missingEssential(dish: MenuDish): string | null {
    return blockingIngredient(dish, today.value);
}

/** Ni agotado ni pedible: le falta un ingrediente esencial o un grupo obligatorio se quedó sin opciones. */
function unavailable(dish: MenuDish): boolean {
    return !soldOut(dish) && (missingEssential(dish) !== null || (order !== null && !isOrderable(dish, today.value)));
}

/** «Hoy sin X» o «Hoy con Y en lugar de X», por cada ingrediente no esencial que hoy no hay. */
function todayNotes(dish: MenuDish): string[] {
    return ingredientEffects(dish, today.value).flatMap((effect) => {
        switch (effect.kind) {
            case 'blocks':
                return [];
            case 'without':
                return [t('restaurant.menu.today_without', { name: effect.name })];
            case 'substitute':
                return [t('restaurant.menu.today_swap', { substitute: effect.substitute, name: effect.name })];
        }
    });
}

async function open(dish: MenuDish, event: MouseEvent): Promise<void> {
    opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    announcement.value = '';

    try {
        DishPicker.value ??= (await import('@/components/DishPicker.vue')).default;
    } catch {
        // Sin conexión (o un despliegue nuevo) el chunk no baja: se dice y el
        // foco se queda en el plato, para volver a intentar.
        announcement.value = t('order.picker.load_error');

        return;
    }

    picking.value = dish;
}

async function close(): Promise<void> {
    picking.value = null;
    await nextTick();
    opener?.focus();
    opener = null;
}

async function add(item: OrderItem): Promise<void> {
    const added = order?.add(item) ?? item.quantity;
    await close();
    announcement.value =
        added < item.quantity ? t('order.added_capped', { name: item.dish, max: MAX_QUANTITY, count: added }) : t('order.added', { name: item.dish });
}

const summary = computed(() => {
    if (order === null || order.count.value === 0) {
        return null;
    }

    const count = order.count.value;

    return t(count === 1 ? 'order.summary_one' : 'order.summary_many', { count, total: formatPesos(order.total.value, locale.value) });
});
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.menu.title') }}</h2>

        <p v-if="sections.length === 0" class="mt-2 text-ink-muted" data-empty>{{ t('restaurant.menu.empty') }}</p>

        <p v-if="summary" class="mt-2 font-semibold" data-order-summary>{{ summary }}</p>

        <div v-for="(section, index) in sections" :key="index" class="mt-4" data-section>
            <h3 :id="`${headingId}-${index}`" class="text-base">{{ section.name }}</h3>

            <ul class="divide-y divide-line" :aria-labelledby="`${headingId}-${index}`">
                <li v-for="(dish, position) in section.dishes" :key="position" data-dish>
                    <!-- Sin <component :is>: sumaría código de Vue al arranque (bundle.test.ts). -->
                    <button
                        v-if="canOrder(dish)"
                        type="button"
                        aria-haspopup="dialog"
                        class="flex min-h-touch w-full cursor-pointer items-start justify-between gap-4 py-3 text-left hover:bg-surface"
                        data-choose
                        @click="open(dish, $event)"
                    >
                        <MenuDishLine :dish="dish" :sold-out="false" :unavailable="false" :notes="todayNotes(dish)" />
                    </button>
                    <div v-else class="flex items-start justify-between gap-4 py-3">
                        <MenuDishLine :dish="dish" :sold-out="soldOut(dish)" :unavailable="unavailable(dish)" :without="missingEssential(dish)" :notes="soldOut(dish) || missingEssential(dish) !== null ? [] : todayNotes(dish)" />
                    </div>
                </li>
            </ul>
        </div>

        <p role="status" class="sr-only" data-order-announcement>{{ announcement }}</p>

        <DishPicker v-if="DishPicker && picking" :dish="picking" :today="today" :sold-out="!isOrderable(picking, today)" @add="add" @close="close" />
    </section>
</template>
