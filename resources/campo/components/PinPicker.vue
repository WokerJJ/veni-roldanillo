<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';

import type { Draft } from '../draft';
import { BOUNDS, GOOD_ACCURACY_M } from '../draft';
import { t } from '../texts';

/**
 * Toma el punto del NEGOCIO con el GPS del teléfono (ADR 0048): la persona se
 * para en la puerta y toca «Tomar el punto». Se guarda solo ese punto, con la
 * precisión que dijo el GPS para avisar si es mala: ningún recorrido, ninguna
 * lectura anterior ni el punto de otro momento. La lectura se pide una vez y
 * se suelta; nada queda vigilando la posición.
 *
 * El mapa para ver el punto es un chunk aparte que baja solo si se pide, y
 * si no carga (sin señal), el punto queda guardado igual.
 */
const { draft, patch } = defineProps<{
    draft: Draft;
    patch: (changes: Partial<Draft>) => void;
}>();

const PinMap = defineAsyncComponent(() => import('./PinMap.vue'));

type Status = 'idle' | 'waiting' | 'denied' | 'unsupported' | 'failed';

const status = ref<Status>('idle');
const showMap = ref(false);
let cancelled = false;

onBeforeUnmount(() => {
    cancelled = true;
});

function take(): void {
    if (!('geolocation' in navigator)) {
        status.value = 'unsupported';

        return;
    }

    status.value = 'waiting';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            if (cancelled) {
                return;
            }

            status.value = 'idle';
            patch({
                latitude: Number(position.coords.latitude.toFixed(7)),
                longitude: Number(position.coords.longitude.toFixed(7)),
                accuracy: Math.round(position.coords.accuracy),
                locationSource: 'device',
            });
        },
        (error) => {
            if (!cancelled) {
                status.value = error.code === error.PERMISSION_DENIED ? 'denied' : 'failed';
            }
        },
        { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    );
}

function hasPoint(): boolean {
    return draft.latitude !== null && draft.longitude !== null;
}

function outside(): boolean {
    return (
        draft.latitude !== null &&
        draft.longitude !== null &&
        (draft.latitude < BOUNDS.lat[0] || draft.latitude > BOUNDS.lat[1] || draft.longitude < BOUNDS.lng[0] || draft.longitude > BOUNDS.lng[1])
    );
}

function osmUrl(): string {
    return `https://www.openstreetmap.org/?mlat=${String(draft.latitude)}&mlon=${String(draft.longitude)}#map=19/${String(draft.latitude)}/${String(draft.longitude)}`;
}
</script>

<template>
    <section class="pin" aria-labelledby="campo-pin-title">
        <h3 id="campo-pin-title" class="step__title">{{ t('pin.title') }}</h3>
        <p class="field__help">{{ t('pin.help') }}</p>

        <button type="button" class="btn btn--primary" :disabled="status === 'waiting'" @click="take">
            {{ status === 'waiting' ? t('pin.waiting') : hasPoint() ? t('pin.retake') : t('pin.take') }}
        </button>

        <p v-if="status === 'denied'" class="field__error" role="alert">{{ t('pin.denied') }}</p>
        <p v-else-if="status === 'unsupported'" class="field__error" role="alert">{{ t('pin.unsupported') }}</p>
        <p v-else-if="status === 'failed'" class="field__error" role="alert">{{ t('pin.failed') }}</p>

        <div v-if="hasPoint()" class="pin__result" role="status">
            <p class="pin__coords">{{ t('pin.taken', { lat: String(draft.latitude), lng: String(draft.longitude) }) }}</p>
            <p v-if="draft.accuracy !== null" :class="draft.accuracy > GOOD_ACCURACY_M ? 'field__error' : 'field__help'">
                {{ draft.accuracy > GOOD_ACCURACY_M ? t('pin.accuracy_bad', { max: GOOD_ACCURACY_M }) : t('pin.accuracy', { m: draft.accuracy }) }}
            </p>
            <p v-if="outside()" class="field__error" role="alert">{{ t('pin.outside') }}</p>

            <div class="pin__actions">
                <button type="button" class="btn btn--quiet" :aria-expanded="showMap" @click="showMap = !showMap">{{ t('pin.map') }}</button>
                <a class="btn btn--quiet" :href="osmUrl()" target="_blank" rel="noopener noreferrer">{{ t('pin.osm') }}</a>
            </div>

            <PinMap v-if="showMap && draft.latitude !== null && draft.longitude !== null" :latitude="draft.latitude" :longitude="draft.longitude" />
        </div>
    </section>
</template>
