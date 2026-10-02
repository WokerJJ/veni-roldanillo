<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useTheme } from '@/composables/useTheme';
// Solo los tipos: MapLibre y PMTiles llegan con import() al montar (ADR 0007).
import type { MapHandle, MapLabels } from '@/map/engine';
import { mapStyleUrl } from '@/map/styleUrl';

/**
 * Mapa de Roldanillo de veni-mapa, del tamaño de su contenedor. El tema y el
 * idioma los pone la app: elige el estilo `veni-{tema}-{idioma}.json` y lo
 * cambia cuando cambian, sin mover la cámara. No trae botones de tema ni de
 * idioma, solo los de zoom y la atribución de OpenStreetMap.
 */
type Status = 'loading' | 'ready' | 'error';

const { t, locale } = useI18n();
const { theme } = useTheme();

const status = ref<Status>('loading');
const region = useTemplateRef<HTMLElement>('region');
const container = useTemplateRef<HTMLDivElement>('container');

// Fuera de la reactividad: el mapa no es estado de la interfaz.
let handle: MapHandle | null = null;
/** Carga en curso o mapa vivo: al abortarla se cancelan las descargas y se libera el mapa. */
let attempt: AbortController | null = null;

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
    handle = null;
    status.value = 'loading';

    try {
        const requested = styleUrl();
        const { createMap } = await import('@/map/engine');
        // Se desmontó mientras bajaba el código del mapa.
        current.signal.throwIfAborted();

        const created = await createMap({
            container: element,
            styleUrl: requested,
            labels: labels(),
            signal: current.signal,
        });

        handle = created;
        status.value = 'ready';

        // El tema o el idioma pudieron cambiar mientras cargaba.
        created.setLabels(labels());

        if (styleUrl() !== requested) {
            applyStyle(created);
        }
    } catch (error) {
        // Abortada: el componente ya no está o empezó otro intento.
        if (current.signal.aborted) {
            return;
        }

        // Si algo quedó a medias (un mapa ya creado), se libera.
        current.abort();
        handle = null;
        status.value = 'error';
        console.error('[mapa] No se pudo cargar el mapa.', error);
    }
}

function retry(): void {
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
    if (handle) {
        handle.setLabels(labels());
        applyStyle(handle);
    }
});

onMounted(() => {
    void load();
});

onBeforeUnmount(() => {
    attempt?.abort();
    attempt = null;
    handle = null;
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
        <!-- Oculto hasta que pinta: ni el lienzo ni los botones reciben foco debajo del esqueleto. -->
        <div ref="container" class="absolute inset-0" :class="{ invisible: status !== 'ready' }" />

        <div
            v-if="status === 'loading'"
            role="status"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-ink-muted motion-safe:animate-pulse"
        >
            <Icon name="mapa" :size="40" />
            <p class="text-sm">{{ t('map.loading') }}</p>
        </div>

        <!-- z-20: por encima de lo que la página ponga sobre el mapa; nada debe tapar el botón de reintentar. -->
        <div
            v-else-if="status === 'error'"
            role="alert"
            class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center"
        >
            <p class="max-w-prose">{{ t('map.error') }}</p>
            <button
                type="button"
                class="inline-flex min-h-touch items-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco transition-colors hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                @click="retry"
            >
                {{ t('map.retry') }}
            </button>
        </div>
    </section>
</template>
