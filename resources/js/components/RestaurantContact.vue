<script setup lang="ts">
import { computed, useId } from 'vue';

import Icon from '@/components/Icon.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import type { PaymentMethod, RestaurantProfile } from '@/restaurants/profile';

/**
 * Dónde queda un restaurante y cómo hablarle (#13): la dirección con su
 * referencia, el teléfono, el WhatsApp, los medios de pago y el nivel de
 * precios. Son los datos del negocio, los que el restaurante publica; de lo
 * que no cargó no queda ni el rótulo, y sin ninguno la sección no sale.
 *
 * El WhatsApp es un enlace para escribirle, sin mensaje armado: el pedido con
 * el carrito es del #15.
 */
const { restaurant } = defineProps<{
    restaurant: Pick<RestaurantProfile, 'address' | 'reference' | 'phone' | 'whatsapp' | 'payment_methods' | 'price_level'>;
}>();

const { t } = useI18n();
const headingId = useId();

/** Hasta cuánto llega el nivel de precios (CHECK price_level BETWEEN 1 AND 4). */
const PRICE_LEVELS = 4;

const PAYMENT_METHODS: Readonly<Record<PaymentMethod, TranslationKey>> = {
    cash: 'restaurant.payment.cash',
    nequi: 'restaurant.payment.nequi',
    daviplata: 'restaurant.payment.daviplata',
    card: 'restaurant.payment.card',
};

/** Un medio de pago que esta versión de la app todavía no conoce no se muestra como una clave suelta. */
const payments = computed(() => restaurant.payment_methods.filter((method) => method in PAYMENT_METHODS));

const hasAny = computed(
    () =>
        restaurant.address !== null ||
        restaurant.reference !== null ||
        restaurant.phone !== null ||
        restaurant.whatsapp !== null ||
        payments.value.length > 0 ||
        restaurant.price_level !== null,
);

/** Un solo número: dígitos con espacios, guiones y paréntesis, y un `+` al principio. */
const SINGLE_PHONE = /^\s*\+?(?:[\s()-]*\d)+[\s()-]*$/;

/**
 * El teléfono como lo marca un celular: solo dígitos, con el indicativo de
 * Colombia si son los diez de un número nacional (un turista con su línea de
 * afuera lo necesita).
 *
 * El dato es texto libre. Lo que no es un solo número («229 1234 / 229 5678»,
 * «No tiene») no se puede marcar: no lleva enlace (null) y sale como texto.
 */
const phoneHref = computed(() => {
    const phone = restaurant.phone ?? '';

    if (!SINGLE_PHONE.test(phone)) {
        return null;
    }

    const digits = phone.replace(/[^\d+]/g, '');

    return `tel:${/^\d{10}$/.test(digits) ? `+57${digits}` : digits}`;
});

/** «573001234567» → «+57 300 123 4567»; lo que no tenga esa forma, tal cual. */
const whatsappText = computed(() => {
    const [, area, first, last] = /^57(\d{3})(\d{3})(\d{4})$/.exec(restaurant.whatsapp ?? '') ?? [];

    return area === undefined ? (restaurant.whatsapp ?? '') : `+57 ${area} ${String(first)} ${String(last)}`;
});
</script>

<template>
    <section v-if="hasAny" :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.contact.title') }}</h2>

        <dl class="mt-2 grid max-w-md gap-3">
            <div v-if="restaurant.address !== null || restaurant.reference !== null" data-address>
                <dt class="text-sm text-ink-muted">{{ t('restaurant.contact.address') }}</dt>
                <dd class="wrap-anywhere">
                    <span v-if="restaurant.address !== null" class="block">{{ restaurant.address }}</span>
                    <span v-if="restaurant.reference !== null" class="block text-sm text-ink-muted">{{ restaurant.reference }}</span>
                </dd>
            </div>

            <div v-if="restaurant.phone !== null" data-phone>
                <dt class="text-sm text-ink-muted">{{ t('restaurant.contact.phone') }}</dt>
                <dd>
                    <a
                        v-if="phoneHref !== null"
                        :href="phoneHref"
                        class="inline-flex min-h-touch items-center gap-2 rounded-veni-sm font-semibold underline underline-offset-4"
                    >
                        <Icon name="telefono" :size="20" class="shrink-0" />
                        {{ restaurant.phone }}
                    </a>
                    <span v-else class="wrap-anywhere">{{ restaurant.phone }}</span>
                </dd>
            </div>

            <div v-if="restaurant.whatsapp !== null" data-whatsapp>
                <dt class="text-sm text-ink-muted">{{ t('restaurant.contact.whatsapp') }}</dt>
                <dd>
                    <a
                        :href="`https://wa.me/${restaurant.whatsapp}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex min-h-touch items-center gap-2 rounded-veni-sm font-semibold underline underline-offset-4"
                    >
                        <Icon name="enlace-externo" :size="20" class="shrink-0" />
                        {{ whatsappText }}
                    </a>
                </dd>
            </div>

            <div v-if="payments.length > 0" data-payments>
                <dt :id="`${headingId}-payments`" class="text-sm text-ink-muted">{{ t('restaurant.contact.payment') }}</dt>
                <dd>
                    <ul class="mt-1 flex flex-wrap gap-1.5" :aria-labelledby="`${headingId}-payments`">
                        <li v-for="method in payments" :key="method" class="rounded-full bg-surface px-2.5 py-0.5 text-sm">
                            {{ t(PAYMENT_METHODS[method]) }}
                        </li>
                    </ul>
                </dd>
            </div>

            <div v-if="restaurant.price_level !== null" data-price-level>
                <dt class="text-sm text-ink-muted">{{ t('restaurant.contact.price_level') }}</dt>
                <dd>{{ t('restaurant.contact.price_level_of', { level: restaurant.price_level, max: PRICE_LEVELS }) }}</dd>
            </div>
        </dl>
    </section>
</template>
