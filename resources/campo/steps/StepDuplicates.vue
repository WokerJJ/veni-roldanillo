<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { Candidate, Draft, Errors } from '../draft';
import { t } from '../texts';

/**
 * Paso 3: antes de crear otra ficha, buscar si el negocio ya está (publicado,
 * oculto o como borrador de OpenStreetMap). Sin señal no se puede: se avisa y
 * el servidor lo vuelve a revisar al recibirla.
 */
const { draft, errors, check, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    online: boolean;
    check: () => Promise<Candidate[] | null>;
    patch: (changes: Partial<Draft>) => void;
}>();

const searching = ref(false);
const unavailable = ref(false);

async function search(): Promise<void> {
    searching.value = true;
    const found = await check();
    searching.value = false;
    unavailable.value = found === null;

    if (found !== null) {
        patch({ duplicates: found });
    }
}

onMounted(() => {
    if (draft.duplicates === null) {
        void search();
    }
});

function candidates(): Candidate[] {
    return draft.duplicates ?? [];
}

function describe(candidate: Candidate): string {
    const status = t(`duplicates.status_${candidate.status}`);

    return t('duplicates.candidate', { name: candidate.name, status, distance: candidate.distance_m }) + (candidate.from_osm ? ` · ${t('duplicates.osm')}` : '');
}

/** Se puede completar una ficha oculta; una publicada solo se descarta como «otro negocio». */
function canComplete(candidate: Candidate): boolean {
    return candidate.kind === 'restaurant' && candidate.status === 'hidden';
}

function complete(candidate: Candidate): void {
    patch({ restaurantId: candidate.restaurant_id, distinctFrom: draft.distinctFrom.filter((id) => id !== candidate.restaurant_id) });
}

function markOther(candidate: Candidate): void {
    if (candidate.restaurant_id === null) {
        return;
    }

    patch({
        restaurantId: draft.restaurantId === candidate.restaurant_id ? null : draft.restaurantId,
        distinctFrom: [...draft.distinctFrom.filter((id) => id !== candidate.restaurant_id), candidate.restaurant_id],
    });
}
</script>

<template>
    <div class="step">
        <h3 class="step__title">{{ t('duplicates.title') }}</h3>

        <p v-if="searching" role="status">{{ t('duplicates.checking') }}</p>
        <p v-else-if="unavailable || !online" class="notice" role="status">{{ t('duplicates.offline') }}</p>
        <p v-else-if="candidates().length === 0" role="status">{{ t('duplicates.none') }}</p>

        <template v-if="candidates().length > 0">
            <p>{{ t('duplicates.found') }}</p>
            <ul class="candidates">
                <li v-for="candidate in candidates()" :key="String(candidate.id)" class="candidate">
                    <p class="candidate__name">{{ candidate.kind === 'submission' ? t('duplicates.in_flight', { name: candidate.name }) : describe(candidate) }}</p>

                    <template v-if="candidate.kind === 'restaurant' && candidate.restaurant_id !== null">
                        <p v-if="draft.restaurantId === candidate.restaurant_id" class="candidate__state">{{ t('duplicates.completing') }}</p>
                        <p v-else-if="draft.distinctFrom.includes(candidate.restaurant_id)" class="candidate__state">{{ t('duplicates.other_marked') }}</p>
                        <p v-else-if="!canComplete(candidate)" class="field__error">{{ t('duplicates.published_block') }}</p>

                        <div class="candidate__actions">
                            <button v-if="canComplete(candidate)" type="button" class="btn" :aria-pressed="draft.restaurantId === candidate.restaurant_id" @click="complete(candidate)">{{ t('duplicates.complete') }}</button>
                            <button type="button" class="btn btn--quiet" :aria-pressed="draft.distinctFrom.includes(candidate.restaurant_id)" @click="markOther(candidate)">{{ t('duplicates.other') }}</button>
                        </div>
                    </template>
                </li>
            </ul>
        </template>

        <p v-if="errors.duplicates" class="field__error" role="alert">{{ t('duplicates.published_block') }}</p>

        <button type="button" class="btn btn--quiet" :disabled="searching || !online" @click="search">{{ t('duplicates.check') }}</button>
    </div>
</template>
