<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue';

import type OrderCartComponent from '@/components/OrderCart.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import { useOrder } from '@/order/useOrder';
import type { RestaurantProfile } from '@/restaurants/profile';

/**
 * La barra del pedido en la ficha (#15, ADR 0024): aparece abajo, fija, en
 * cuanto hay algo en el pedido del restaurante («Ver tu pedido · 2 platos ·
 * $ 40.000») y abre el carrito. Es lo único del carrito que baja con la
 * ficha: el carrito (OrderCart.vue) se importa a mano al tocarla, como el
 * selector de platos, sin defineAsyncComponent (sumaría código al chunk de
 * Vue, el del arranque).
 */
const { restaurant } = defineProps<{
    restaurant: Pick<RestaurantProfile, 'slug' | 'name' | 'whatsapp' | 'delivery' | 'payment_methods'>;
}>();

const { t, locale } = useI18n();
const { count, total } = useOrder(restaurant.slug);

const OrderCart = shallowRef<typeof OrderCartComponent | null>(null);
const open = ref(false);
const announcement = ref('');
let opener: HTMLElement | null = null;

const summary = computed(() =>
    count.value === 0
        ? ''
        : `${t(count.value === 1 ? 'order.bar.count_one' : 'order.bar.count_many', { count: count.value })} · ${formatPesos(total.value, locale.value)}`,
);

async function show(event: MouseEvent): Promise<void> {
    opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    announcement.value = '';

    try {
        OrderCart.value ??= (await import('@/components/OrderCart.vue')).default;
    } catch {
        // Sin conexión (o con un despliegue nuevo) el chunk no baja: se dice y
        // el foco se queda en la barra, para volver a intentar.
        announcement.value = t('order.cart.load_error');

        return;
    }

    open.value = true;
}

/** El foco vuelve a la barra; si el pedido quedó vacío y la barra se fue, al título de la ficha. */
async function close(): Promise<void> {
    open.value = false;
    await nextTick();

    if (opener?.isConnected === true) {
        opener.focus();
    } else {
        document.querySelector<HTMLElement>('h1')?.focus();
    }

    opener = null;
}
</script>

<template>
    <div v-if="count > 0" class="order-bar-spacer" aria-hidden="true" />
    <div v-if="count > 0" class="order-bar" data-order-bar>
        <button
            type="button"
            aria-haspopup="dialog"
            class="flex min-h-touch w-full items-center justify-between gap-3 rounded-full bg-veni-ciruela px-5 py-2 text-left font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
            data-open-cart
            @click="show"
        >
            <!-- En una línea: el espacio entre los dos separa las palabras del nombre accesible. -->
            <span>{{ t('order.bar.open') }}</span> <span class="tabular-nums" data-bar-summary>{{ summary }}</span>
        </button>
    </div>
    <p role="status" class="sr-only" data-bar-announcement>{{ announcement }}</p>

    <OrderCart v-if="OrderCart && open" :restaurant="restaurant" @close="close" />
</template>

<style scoped>
/*
 * Fija abajo, como el panel del mapa en el celular (ADR 0022), con el margen
 * de la barra del sistema. El espaciador deja que lo último de la ficha no
 * quede tapado. CSS propio de la ficha, no utilidades nuevas de Tailwind (el
 * CSS de Tailwind baja con el arranque).
 */
.order-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 10;
    margin-inline: auto;
    max-width: 48rem;
    padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
    background: var(--color-canvas);
    border-top: 1px solid var(--color-line);
}

.order-bar-spacer {
    height: calc(4.5rem + env(safe-area-inset-bottom));
}
</style>
