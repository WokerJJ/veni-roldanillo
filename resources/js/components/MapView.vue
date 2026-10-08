<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useTheme } from '@/composables/useTheme';
// Solo los tipos: MapLibre y PMTiles llegan con import() al montar (ADR 0007).
import type { MapHandle, MapLabels } from '@/map/engine';
import { MapUnavailableError } from '@/map/errors';
import { fetchMapStyle } from '@/map/fetchStyle';
import { mapStyleUrl } from '@/map/styleUrl';
import { MAP_CONTEXT } from '@/map/useMapLayers';

/**
 * Mapa de Roldanillo de veni-mapa, del tamaño de su contenedor. El tema y el
 * idioma los pone la app: elige el estilo `veni-{tema}-{idioma}.json` y lo
 * cambia cuando cambian, sin mover la cámara. No trae botones de tema ni de
 * idioma, solo los de zoom y la atribución de OpenStreetMap.
 *
 * Lo que la app pinta encima va adentro, como componentes (ADR 0016):
 *
 *     <MapView><RestaurantsLayer /></MapView>
 *
 * Cada uno registra sus capas con `useMapLayers()` y no importa MapLibre. Se
 * montan con el mapa todavía cargando: el mapa les llega cuando ya pinta.
 */
type Status = 'loading' | 'ready' | 'error';

const emit = defineEmits<{
    /** Cambió el estado del mapa: con `error` su aviso lo ocupa entero, y la página acomoda lo que tenía encima. */
    status: [status: Status];
}>();

const { t, locale } = useI18n();
const { theme } = useTheme();

const status = ref<Status>('loading');
/** El error no fue de conexión (sin WebGL, falta la URL del estilo): el mensaje no manda a revisarla. */
const unavailable = ref(false);
const region = useTemplateRef<HTMLElement>('region');
const container = useTemplateRef<HTMLDivElement>('container');

/**
 * El mapa, cuando ya pinta. Es una referencia (sin reactividad hacia adentro)
 * para que los componentes de adentro sepan cuándo hay mapa y cuándo es otro.
 */
const handle = shallowRef<MapHandle | null>(null);
provide(MAP_CONTEXT, { map: handle });
/** Carga en curso o mapa vivo: al abortarla se cancelan las descargas y se libera el mapa. */
let attempt: AbortController | null = null;
/** El código del mapa no bajó (se cortó la señal a mitad del import()). */
let engineMissing = false;

function styleUrl(): string {
    return mapStyleUrl(import.meta.env.VITE_MAP_STYLE_URL, theme.value, locale.value);
}

function labels(): MapLabels {
    return {
        canvas: t('map.canvas_label'),
        zoomIn: t('map.zoom_in'),
        zoomOut: t('map.zoom_out'),
    };
}

async function load(): Promise<void> {
    const element = container.value;

    if (!element) {
        return;
    }

    attempt?.abort();
    const current = new AbortController();
    attempt = current;
    handle.value = null;
    status.value = 'loading';

    try {
        const requested = styleUrl();
        // El estilo se pide ya, a la vez que el código del mapa, en vez de
        // esperar a que baje MapLibre para empezar.
        const style = fetchMapStyle(requested, current.signal);
        // Si el motor no baja, nadie llega a esperar el estilo: su fallo no
        // queda como un rechazo sin atender.
        style.catch(() => undefined);

        const { createMap } = await import('@/map/engine').catch((error: unknown) => {
            engineMissing = true;
            throw error;
        });
        // Se desmontó mientras bajaba el código del mapa.
        current.signal.throwIfAborted();

        const created = await createMap({
            container: element,
            style,
            labels: labels(),
            signal: current.signal,
        });

        // Ya pinta: se deja ver mientras llegan los tiles, sin esperar a que termine.
        handle.value = created;
        status.value = 'ready';

        // El tema o el idioma pudieron cambiar mientras cargaba.
        created.setLabels(labels());

        if (styleUrl() !== requested) {
            applyStyle(created);
        }

        // Hasta que termine de cargar, que falle la fuente de los tiles o el
        // worker todavía cuenta como «no se pudo cargar».
        await created.loaded;
    } catch (error) {
        // Abortada: el componente ya no está o empezó otro intento.
        if (current.signal.aborted) {
            return;
        }

        // Si algo quedó a medias (un mapa ya creado), se libera.
        current.abort();
        handle.value = null;
        unavailable.value = error instanceof MapUnavailableError;
        status.value = 'error';
        console.error('[mapa] No se pudo cargar el mapa.', error);
    }
}

function retry(): void {
    if (engineMissing) {
        // Repetir el import() traería el código, pero no la hoja de estilos
        // de MapLibre que Vite carga con él (ya la da por pedida): el mapa
        // saldría sin estilos. Recargar la página pide las dos cosas.
        window.location.reload();

        return;
    }

    // El botón desaparece al reintentar: el foco pasa a la región del mapa
    // en vez de perderse al principio de la página.
    region.value?.focus();
    void load();
}

function applyStyle(map: MapHandle): void {
    const signal = attempt?.signal;

    map.setStyle(styleUrl()).catch((error: unknown) => {
        // Sin el estilo nuevo (sin señal) el mapa sigue usable con el anterior.
        if (!signal?.aborted) {
            console.error('[mapa] No se pudo cambiar el estilo del mapa.', error);
        }
    });
}

// El tema o el idioma cambiaron: el mismo mapa pasa al estilo y a los textos
// nuevos. Sin mapa (cargando o con error) no hay nada que cambiar: al terminar
// de cargar, o al reintentar, se usan los valores del momento.
watch([theme, locale], () => {
    if (handle.value) {
        handle.value.setLabels(labels());
        applyStyle(handle.value);
    }
});

watch(status, (current) => {
    emit('status', current);
});

onMounted(() => {
    void load();
});

onBeforeUnmount(() => {
    attempt?.abort();
    attempt = null;
    handle.value = null;
});

defineExpose({
    /** Lleva el foco a la región del mapa (al cerrar algo que se abrió desde él). */
    focus(): void {
        region.value?.focus({ preventScroll: true });
    },
});
</script>

<template>
    <section
        ref="region"
        tabindex="-1"
        class="relative size-full overflow-hidden bg-surface focus:outline-none"
        :aria-label="t('map.label')"
        :aria-busy="status === 'loading'"
    >
        <!-- Oculto hasta que empieza a pintar: ni el lienzo ni los botones reciben foco debajo del esqueleto. -->
        <div ref="container" class="absolute inset-0" :class="{ invisible: status !== 'ready' }" />

        <div
            v-if="status === 'loading'"
            role="status"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-ink-muted motion-safe:animate-pulse"
        >
            <Icon name="mapa" :size="40" />
            <p class="text-sm">{{ t('map.loading') }}</p>
        </div>

        <!--
            z-20: por encima de lo que la página ponga sobre el mapa; nada debe
            tapar el botón de reintentar. Lo que deba seguir a la vista sin mapa
            lo saca de encima la página, que se entera por `status`.
        -->
        <div
            v-else-if="status === 'error'"
            role="alert"
            class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center"
        >
            <p class="max-w-prose">{{ unavailable ? t('map.unavailable') : t('map.error') }}</p>
            <button
                type="button"
                class="inline-flex min-h-touch items-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco transition-colors hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                @click="retry"
            >
                {{ t('map.retry') }}
            </button>
        </div>

        <!-- Lo que la app pinta sobre el mapa: componentes que registran sus capas (useMapLayers). -->
        <slot />
    </section>
</template>
