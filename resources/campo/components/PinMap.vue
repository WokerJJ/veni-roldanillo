<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { fetchMapStyle } from '@/map/fetchStyle';
import { mapStyleUrl } from '@/map/styleUrl';

import { currentLocale, t } from '../texts';

/**
 * Muestra el punto tomado sobre el mapa de Vení, para confirmarlo a la vista
 * (ADR 0048). Es un chunk aparte: el motor del mapa baja solo cuando se toca
 * «Ver en el mapa» y sale de la caché del service worker desde la segunda vez.
 * Sin señal los tiles no cargan: se avisa y el punto queda guardado igual (los
 * PMTiles no se guardan sin conexión, ADR 0015).
 */
const { latitude, longitude } = defineProps<{ latitude: number; longitude: number }>();

const container = ref<HTMLElement | null>(null);
const status = ref<'loading' | 'ready' | 'failed'>('loading');
const abort = new AbortController();

const SOURCE = 'campo-pin';

onMounted(async () => {
    const element = container.value;

    if (!element) {
        return;
    }

    try {
        const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        const style = fetchMapStyle(mapStyleUrl(import.meta.env.VITE_MAP_STYLE_URL, theme, currentLocale()), abort.signal);
        style.catch(() => undefined);

        const { createMap } = await import('@/map/engine');
        const map = await createMap({
            container: element,
            style,
            signal: abort.signal,
            labels: {
                canvas: t('map.canvas'),
                zoomIn: t('map.zoom_in'),
                zoomOut: t('map.zoom_out'),
                locate: {
                    button: t('map.locate'),
                    found: t('map.locate_found'),
                    close: t('map.locate_close'),
                    problems: {
                        denied: t('map.locate_denied'),
                        signal: t('map.locate_signal'),
                        outside: t('map.locate_outside'),
                        unsupported: t('map.locate_unsupported'),
                    },
                },
                attribution: { button: t('map.attribution'), credit: t('map.credit') },
            },
        });

        map.addLayerGroup({
            id: SOURCE,
            sources: {
                [`${SOURCE}-point`]: {
                    type: 'geojson',
                    data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude] } },
                },
            },
            layers: [
                { id: `${SOURCE}-halo`, type: 'circle', source: `${SOURCE}-point`, paint: { 'circle-radius': 18, 'circle-color': '#F0525A', 'circle-opacity': 0.25 } },
                { id: `${SOURCE}-dot`, type: 'circle', source: `${SOURCE}-point`, paint: { 'circle-radius': 8, 'circle-color': '#F0525A', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } },
            ],
        });
        map.showPoint([longitude, latitude], { minZoom: 17 });
        await map.loaded;
        status.value = 'ready';
    } catch {
        status.value = 'failed';
    }
});

onBeforeUnmount(() => {
    abort.abort();
});
</script>

<template>
    <div class="pinmap">
        <div ref="container" class="pinmap__canvas" />
        <p v-if="status === 'loading'" class="field__help" role="status">{{ t('loading') }}</p>
        <p v-else-if="status === 'failed'" class="field__error" role="status">{{ t('pin.map_failed') }}</p>
    </div>
</template>
