<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import type { TranslationKey } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import type { RouteProfile, RouteState } from '@/routing/directions';
import { formatDistance, formatDuration, googleMapsUrl, PROFILES, wazeUrl } from '@/routing/directions';

/**
 * El panel de «Cómo llegar» (#11, ADR 0020), dentro del resumen del
 * restaurante: a pie o en carro, con su distancia y duración estimadas, en
 * qué va el cálculo y los enlaces para navegar con Google Maps o Waze. La
 * ruta la calcula y la dibuja RouteLayer.vue, en el mapa; aquí solo llega
 * `state`, sin la posición de nadie.
 *
 * Llega con import() al pedir la primera ruta: no pesa en el arranque.
 */
const props = defineProps<{
    state: RouteState;
    profile: RouteProfile;
    /** El restaurante, `[longitud, latitud]`: lo único que llevan los enlaces. */
    destination: [number, number];
}>();

defineEmits<{
    profile: [profile: RouteProfile];
    retry: [];
    close: [];
}>();

const { t, locale } = useI18n();
const heading = useTemplateRef<HTMLElement>('heading');

// Reemplaza al botón que lo abrió: el foco pasa a su título, y no se pierde.
onMounted(() => {
    heading.value?.focus({ preventScroll: true });
});

const PROFILE_NAMES: Readonly<Record<RouteProfile, TranslationKey>> = { foot: 'directions.foot', car: 'directions.car' };
const READY: Readonly<Record<RouteProfile, TranslationKey>> = { foot: 'directions.ready_foot', car: 'directions.ready_car' };
const MESSAGES: Readonly<Record<Exclude<RouteState['status'], 'ready'>, TranslationKey>> = {
    locating: 'directions.locating',
    calculating: 'directions.calculating',
    'no-route': 'directions.no_route',
    far: 'directions.far',
    'destination-far': 'directions.destination_far',
    outside: 'directions.outside',
    offline: 'directions.offline',
    error: 'directions.error',
    denied: 'directions.denied',
    signal: 'directions.signal',
    unsupported: 'directions.unsupported',
    off: 'directions.off',
    unavailable: 'directions.unavailable',
};

const routes = computed(() => (props.state.status === 'ready' ? props.state.routes : null));

/** «12 min · 900 m», o que con ese perfil no hay ruta. */
function summaryOf(profile: RouteProfile): string {
    const route = routes.value?.[profile];

    if (route === undefined) {
        return '';
    }

    return route === null
        ? t('directions.none_for_profile')
        : `${formatDuration(route.duration, locale.value)} · ${formatDistance(route.distance, locale.value)}`;
}

/** Lo que dice la región de estado: el cálculo, o qué pasó. */
const message = computed(() => {
    const { state, profile } = props;

    if (state.status !== 'ready') {
        return t(MESSAGES[state.status]);
    }

    const route = state.routes[profile];

    return route === null
        ? t('directions.none_for_profile')
        : t(READY[profile], { duration: formatDuration(route.duration, locale.value), distance: formatDistance(route.distance, locale.value) });
});

/** Desde estos estados vale la pena volver a intentar. */
const canRetry = computed(() => ['no-route', 'far', 'outside', 'offline', 'denied', 'signal', 'off'].includes(props.state.status));
</script>

<template>
    <div class="mt-3 border-t border-line pt-3" data-directions>
        <div class="flex items-center justify-between gap-2">
            <h3 ref="heading" tabindex="-1" class="font-display text-base font-semibold focus:outline-none">{{ t('directions.title') }}</h3>
            <button
                type="button"
                class="-mr-2 inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                :aria-label="t('directions.close')"
                @click="$emit('close')"
            >
                <Icon name="cerrar" :size="20" />
            </button>
        </div>

        <div role="group" :aria-label="t('directions.profile')" class="mt-1 grid grid-cols-2 gap-2">
            <button
                v-for="option in PROFILES"
                :key="option"
                type="button"
                :aria-pressed="profile === option"
                class="min-h-touch rounded-veni-sm border px-3 py-1.5 text-left transition-colors"
                :class="profile === option ? 'border-veni-ciruela bg-veni-ciruela text-veni-blanco dark:border-veni-mango dark:bg-veni-mango dark:text-veni-ciruela' : 'border-line hover:bg-surface'"
                :data-profile="option"
                @click="$emit('profile', option)"
            >
                <span class="block font-semibold">{{ t(PROFILE_NAMES[option]) }}</span>
                <span v-if="routes" class="block text-sm">{{ summaryOf(option) }}</span>
            </button>
        </div>

        <p role="status" class="mt-2 text-sm" :class="{ 'motion-safe:animate-pulse': state.status === 'locating' || state.status === 'calculating' }" data-route-status>
            {{ message }}
        </p>
        <p v-if="routes" class="mt-1 text-xs text-ink-muted" data-estimate>{{ t('directions.estimate') }}</p>

        <button
            v-if="canRetry"
            type="button"
            class="mt-2 inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold transition-colors hover:bg-surface"
            @click="$emit('retry')"
        >
            {{ t('directions.retry') }}
        </button>

        <p class="mt-3 text-sm">{{ t('directions.navigate') }}</p>
        <!-- En una fila: con la ruta, el panel no tapa más mapa del necesario. -->
        <div class="mt-1 grid grid-cols-2 gap-2">
            <a
                :href="googleMapsUrl(destination, profile)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-full border border-line px-3 font-semibold transition-colors hover:bg-surface"
                data-google-maps
            >
                {{ t('directions.google_maps') }}
                <Icon name="enlace-externo" :size="16" />
            </a>
            <a
                :href="wazeUrl(destination)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-full border border-line px-3 font-semibold transition-colors hover:bg-surface"
                data-waze
            >
                {{ t('directions.waze') }}
                <Icon name="enlace-externo" :size="16" />
            </a>
        </div>

        <!-- La licencia de los datos (ODbL) pide nombrarla y enlazar a ella. -->
        <p class="mt-2 text-xs text-ink-muted" data-attribution>
            {{ t('directions.attribution') }}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" class="underline">{{ t('directions.attribution_link') }}</a>.
        </p>
    </div>
</template>
