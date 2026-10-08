<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed } from 'vue';

import Icon from '@/components/Icon.vue';
import RestaurantHours from '@/components/RestaurantHours.vue';
import RestaurantMenu from '@/components/RestaurantMenu.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import type { PageMeta } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatDate } from '@/i18n/intl';
import { openStatus } from '@/restaurants/openStatus';
import type { RestaurantProfile } from '@/restaurants/profile';
import { openStatusText } from '@/restaurants/statusText';

/**
 * La ficha de un restaurante (#13, ADR 0018): GET /restaurants/{slug}. Lo que
 * muestra llega en `restaurant`, una lista blanca que arma el servidor
 * (App\Http\Resources\RestaurantProfile); `meta` trae el título y la
 * descripción del documento, que el servidor ya escribió en el HTML.
 *
 * «Abierto ahora» no viene del servidor: se calcula aquí con el horario de
 * las props y el mismo módulo que usa el mapa (openStatus.ts, ADR 0017), y se
 * pone al día solo mientras la página siga abierta.
 */
const { restaurant, meta } = defineProps<{
    restaurant: RestaurantProfile;
    meta: PageMeta;
}>();

const { t, locale } = useI18n();
const now = useNow();

const status = computed(() => openStatus(restaurant, now.value));
const statusText = computed(() => openStatusText(status.value, t, locale.value));
</script>

<template>
    <Head :title="meta.title" />

    <div class="mx-auto w-full max-w-3xl px-4 pt-2 pb-10">
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('restaurant.back_to_map') }}
        </Link>

        <article>
            <header class="mt-2">
                <!-- Solo la recibe quien puede verla oculta: que no la tome por publicada. -->
                <p v-if="restaurant.hidden" class="mb-3 flex items-start gap-2 rounded-veni-sm border border-line bg-surface p-3 text-sm" data-hidden>
                    <Icon name="informacion" :size="20" class="shrink-0" />
                    <span>{{ t('restaurant.hidden') }}</span>
                </p>

                <h1 class="text-2xl leading-tight wrap-anywhere min-[480px]:text-3xl">{{ restaurant.name }}</h1>

                <p v-if="restaurant.fictitious" class="mt-2"><SampleDataBadge /></p>

                <ul v-if="restaurant.categories.length > 0" class="mt-3 flex flex-wrap gap-1.5" :aria-label="t('restaurants.categories')">
                    <li v-for="category in restaurant.categories" :key="category.slug" class="rounded-full bg-surface px-2.5 py-0.5 text-sm">
                        {{ category.name }}
                    </li>
                </ul>

                <p class="mt-3 flex items-start gap-2" :class="status.state === 'open' ? 'font-semibold' : 'text-ink-muted'" data-status>
                    <Icon name="reloj" :size="20" class="mt-0.5 shrink-0" />
                    <span>{{ statusText }}</span>
                </p>

                <p v-if="restaurant.description" class="mt-4 max-w-prose whitespace-pre-line" data-description>{{ restaurant.description }}</p>

                <!-- Sin reclamar: nadie del restaurante confirmó estos datos. -->
                <p v-if="restaurant.unverified" class="mt-3 flex items-start gap-2 text-sm text-ink-muted" data-unverified>
                    <Icon name="informacion" :size="20" class="shrink-0" />
                    <span>
                        {{
                            restaurant.updated_on
                                ? t('restaurant.unverified_since', { date: formatDate(restaurant.updated_on, locale) })
                                : t('restaurant.unverified')
                        }}
                    </span>
                </p>
            </header>

            <RestaurantHours class="mt-8 border-t border-line pt-6" :hours="restaurant.hours" :special-hours="restaurant.special_hours" />

            <RestaurantMenu class="mt-8 border-t border-line pt-6" :sections="restaurant.menu" />
        </article>
    </div>
</template>
