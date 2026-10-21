<script setup lang="ts">
import { Head, router, usePage } from '@inertiajs/vue3';
import type { Component, FunctionalComponent } from 'vue';
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';

import BottomSheet from '@/components/BottomSheet.vue';
import Icon from '@/components/Icon.vue';
import MapView from '@/components/MapView.vue';
import RestaurantsLayer from '@/components/RestaurantsLayer.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import type { SheetSnap } from '@/components/sheet';
import { useI18n } from '@/composables/useI18n';
import { SELECTED_PARAM, selectedFromUrl } from '@/restaurants/links';
import { useRestaurants } from '@/restaurants/useRestaurants';
// Solo los tipos: la ruta llega con import() al pedirla (ADR 0020).
import type { RouteProfile, RouteState } from '@/routing/directions';
import { takeDirections } from '@/routing/intent';

/*
| «Cómo llegar» (#11): la capa de la ruta (con el router y el grafo) y su
| panel bajan recién cuando alguien pide la primera ruta, no con el inicio.
| Con import() a mano y no con defineAsyncComponent, que sumaría su código
| (y el de Suspense) al arranque.
*/
const routeParts = shallowRef<{ layer: Component; panel: Component } | null>(null);

/** Lo que bajó de «Cómo llegar», con los atributos que le da la plantilla; hasta que baja, nada. */
const RouteLayer: FunctionalComponent = (_props, { attrs }) => (routeParts.value ? h(routeParts.value.layer, attrs) : null);
const RouteDirections: FunctionalComponent = (_props, { attrs }) => (routeParts.value ? h(routeParts.value.panel, attrs) : null);

/*
| El resumen y la lista (con lo que necesitan: el estado de cada horario y
| «Cómo llegar») no se ven al abrir el inicio: bajan apenas monta, sin
| esperar a que alguien los pida, pero fuera del arranque (ADR 0022). Mientras
| tanto, y si no bajan, el panel sigue con la bienvenida.
*/
const panelParts = shallowRef<{ summary: Component; list: Component; distances: Component } | null>(null);
let loadingPanelParts = false;

const RestaurantSummary: FunctionalComponent = (_props, { attrs, slots }) => (panelParts.value ? h(panelParts.value.summary, attrs, slots) : null);
const RestaurantList: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.list, attrs) : null);
const RestaurantDistances: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.distances, attrs) : null);

function loadPanelParts(): void {
    if (panelParts.value !== null || loadingPanelParts) {
        return;
    }

    loadingPanelParts = true;
    Promise.all([import('@/components/RestaurantSummary.vue'), import('@/components/RestaurantList.vue'), import('@/components/RestaurantDistances.vue')])
        .then(([summary, list, distances]) => {
            panelParts.value = { summary: summary.default, list: list.default, distances: distances.default };
        })
        .catch((error: unknown) => {
            // Sin señal y sin la PWA guardada: se vuelve a pedir al tocar un restaurante o «Ver la lista».
            console.error('[inicio] No se pudo cargar el resumen ni la lista.', error);
        })
        .finally(() => {
            loadingPanelParts = false;
        });
}

function loadRouteParts(): void {
    if (routeParts.value !== null) {
        return;
    }

    Promise.all([import('@/components/RouteLayer.vue'), import('@/components/RouteDirections.vue')])
        .then(([layer, panel]) => {
            routeParts.value = { layer: layer.default, panel: panel.default };
        })
        .catch((error: unknown) => {
            // Sin señal a mitad de la descarga: el panel lo dice y la próxima vez se reintenta.
            console.error('[ruta] No se pudo cargar «Cómo llegar».', error);
            routeState.value = { status: 'offline' };
        });
}

// El mapa ocupa todo el alto bajo la cabecera: el layout va sin pie de página.
defineOptions({ layout: { immersive: true } });

const { t } = useI18n();
const { status, restaurants, retry } = useRestaurants();

/** Slug del restaurante con el resumen abierto. */
const selectedSlug = ref<string | null>(null);
const listOpen = ref(false);
/** Metros hasta cada restaurante con «¿Dónde estoy?» encendido y la lista abierta; si no, null. */
const distances = ref<Record<string, number> | null>(null);
/** El mapa no cargó: su aviso lo ocupa entero y el panel, con la lista, deja de ir encima. */
const mapFailed = ref(false);
/** De dónde se abrió el resumen: al cerrarlo, el foco vuelve ahí. */
let openedFromList = false;
const page = usePage();
/**
 * El restaurante que pide la dirección con que se abrió el inicio (`/?r=slug`,
 * ADR 0018 y 0020): a donde lleva «Cómo llegar» desde una ficha, o «atrás»
 * desde la ficha que se abrió con uno elegido. Se elige una sola vez, cuando
 * llega la lista. Desde ahí la dirección dice cuál está elegido. En la
 * dirección solo viaja el restaurante, nunca la ubicación de quien usa el mapa.
 */
let requestedSlug = selectedFromUrl(page.url);

/** El restaurante hasta el que se pidió la ruta (siempre el elegido), o null. */
const directionsFor = ref<string | null>(null);
const profile = ref<RouteProfile>('foot');
const routeState = ref<RouteState>({ status: 'locating' });
/** Sube con «Volver a intentar»: la capa de la ruta lo vuelve a pedir. */
const routeAttempt = ref(0);

const selected = computed(() => restaurants.value.find(({ slug }) => slug === selectedSlug.value) ?? null);
const directionsOpen = computed(() => selected.value !== null && directionsFor.value === selected.value.slug);
/** Sin mapa no hay ubicación ni dónde dibujar: el panel solo ofrece las otras apps. */
const shownRouteState = computed<RouteState>(() => (mapFailed.value ? { status: 'unavailable' } : routeState.value));
const hasRestaurants = computed(() => status.value === 'ready' && restaurants.value.length > 0);
const hasSampleData = computed(() => restaurants.value.some(({ fictitious }) => fictitious));

/** Lo que dice la región de estado: cargando, cuántos hay o que todavía no hay. */
const statusMessage = computed(() => {
    if (status.value === 'loading') {
        return t('restaurants.loading');
    }

    if (status.value === 'error') {
        return '';
    }

    const count = restaurants.value.length;

    if (count === 0) {
        return t('restaurants.empty');
    }

    return count === 1 ? t('restaurants.count_one') : t('restaurants.count_many', { count });
});

const mapView = useTemplateRef<{ focus: () => void }>('mapView');
const listButton = useTemplateRef<HTMLButtonElement>('listButton');
const statusRegion = useTemplateRef<HTMLElement>('statusRegion');
const sheet = useTemplateRef<{ root: HTMLElement | null }>('sheet');
/** El panel encima del mapa: el motor mide cuánto lo tapa (ADR 0019). */
const panel = computed(() => sheet.value?.root ?? null);

/**
 * La altura del panel de abajo en el celular (ADR 0022). Cada vez que cambia
 * lo que muestra, toma la suya: asomado para la bienvenida con restaurantes
 * (el mapa a la vista), a media altura para la lista, el resumen y la ruta, y
 * para los avisos que piden leerse (sin restaurantes o sin conexión). Desde
 * ahí, quien usa la app la cambia con la manija.
 */
const sheetSnap = ref<SheetSnap>('peek');
const panelView = computed(() => {
    if (selected.value) {
        return directionsOpen.value ? 'route' : 'summary';
    }

    if (listOpen.value) {
        return 'list';
    }

    return status.value === 'error' || (status.value === 'ready' && !hasRestaurants.value) ? 'notice' : 'welcome';
});

watch(panelView, (view) => {
    sheetSnap.value = view === 'welcome' ? 'peek' : 'half';
});

function openList(): void {
    loadPanelParts();
    listOpen.value = true;
}

function selectFromMap(slug: string): void {
    loadPanelParts();
    openedFromList = false;
    selectedSlug.value = slug;
}

function selectFromList(slug: string): void {
    loadPanelParts();
    openedFromList = true;
    selectedSlug.value = slug;
}

/**
 * Cierra el resumen y devuelve el foco a donde se abrió: al botón de ese
 * restaurante en la lista o a la región del mapa. Sin esto el foco quedaría
 * en <body> y habría que recorrer la página desde el principio.
 */
async function closeSummary(): Promise<void> {
    const slug = selectedSlug.value;

    if (slug === null) {
        return;
    }

    selectedSlug.value = null;
    await nextTick();

    if (openedFromList && listOpen.value) {
        // Al botón de ese restaurante en la lista; si ya no está, a su título.
        const items = [...(panel.value?.querySelectorAll<HTMLElement>('button[data-slug]') ?? [])];

        (items.find((item) => item.dataset.slug === slug) ?? panel.value?.querySelector<HTMLElement>('h2'))?.focus();
    } else {
        mapView.value?.focus();
    }
}

async function closeList(): Promise<void> {
    listOpen.value = false;
    await nextTick();
    listButton.value?.focus();
}

function openDirections(): void {
    if (selectedSlug.value === null) {
        return;
    }

    routeState.value = { status: 'locating' };
    directionsFor.value = selectedSlug.value;
    loadRouteParts();
}

async function closeDirections(): Promise<void> {
    directionsFor.value = null;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('button[data-directions]')?.focus();
}

function retryDirections(): void {
    routeState.value = { status: 'locating' };
    routeAttempt.value += 1;
    // Si lo que no bajó fue «Cómo llegar» mismo, se vuelve a pedir.
    loadRouteParts();
}

function retryRestaurants(): void {
    // El botón desaparece al reintentar: el foco pasa al estado, que dice «Cargando…».
    statusRegion.value?.focus();
    retry();
}

/** La dirección de la página (`page.url` de Inertia) con ese restaurante elegido, o sin ninguno. */
function withSelected(url: string, slug: string | null): string {
    const { pathname, searchParams, hash } = new URL(url, window.location.href);

    if (slug === null) {
        searchParams.delete(SELECTED_PARAM);
    } else {
        searchParams.set(SELECTED_PARAM, slug);
    }

    const query = searchParams.toString();

    return `${pathname}${query === '' ? '' : `?${query}`}${hash}`;
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
    }

    if (selectedSlug.value !== null) {
        void closeSummary();
    } else if (listOpen.value) {
        void closeList();
    }
}

/**
 * La dirección dice qué restaurante está elegido (`?r=slug`): así «atrás»
 * desde su ficha vuelve al mapa con él. La visita es en el dispositivo y
 * reemplaza la entrada del historial: no pide nada al servidor, no vuelve a
 * montar la página ni suma una entrada por cada restaurante que se toca.
 */
function syncUrl(slug: string | null): void {
    if (selectedFromUrl(page.url) !== slug) {
        router.replace({ url: withSelected(page.url, slug), preserveScroll: true, preserveState: true });
    }
}

// Llegó la lista: si la dirección pedía un restaurante y está en ella, abre
// elegido, como si lo hubieran tocado en el mapa (la cámara va hasta él:
// RestaurantsLayer), y con la ruta si se pidió desde su ficha. Si no está (se
// ocultó, o el enlace está mal escrito), el inicio abre como siempre y el
// parámetro sale de la dirección.
watch(status, (current) => {
    if (current !== 'ready' || requestedSlug === null) {
        return;
    }

    const slug = requestedSlug;
    requestedSlug = null;

    if (restaurants.value.some((restaurant) => restaurant.slug === slug)) {
        selectFromMap(slug);

        if (takeDirections(slug)) {
            openDirections();
        }
    } else {
        syncUrl(null);
    }
});

// Otro elegido, o ninguno: la dirección lo dice, y la ruta, que era hasta el anterior, se cierra.
watch(selectedSlug, (slug) => {
    if (directionsFor.value !== slug) {
        directionsFor.value = null;
    }

    if (requestedSlug === null) {
        syncUrl(slug);
    }
});

// La lista se volvió a pedir (otro idioma) y el elegido ya no está: se cierra su resumen.
watch(selected, (restaurant) => {
    if (restaurant === null && selectedSlug.value !== null) {
        void closeSummary();
    }
});

// Cerrada la lista, sus distancias se olvidan: la próxima vez se calculan de nuevo.
watch(listOpen, (open) => {
    if (!open) {
        distances.value = null;
    }
});

// Sin restaurantes no hay lista que mostrar.
watch(restaurants, (current) => {
    if (current.length === 0) {
        listOpen.value = false;
    }
});

onMounted(() => {
    document.addEventListener('keydown', onKeydown);
    loadPanelParts();
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <Head :title="t('home.title')" />

    <div class="absolute inset-0" :class="{ 'flex flex-col overflow-y-auto': mapFailed }">
        <!--
            Panel sobre el mapa (va antes en el documento: el título se lee
            primero). Muestra la bienvenida con el estado de los restaurantes,
            la lista o el resumen del restaurante elegido. Por debajo de
            768 px es un panel de abajo con tres alturas (BottomSheet.vue,
            ADR 0022) que deja libre la franja de la atribución de
            OpenStreetMap (la misma holgura que el aviso de versión nueva) y,
            si ese aviso se ve, se corre encima de él (UpdatePrompt.vue).
            Desde 768 px queda arriba a la izquierda, sin tocar los botones
            de zoom, con el mismo margen que la cabecera, y nunca pasa del
            alto del mapa: lo de adentro se desplaza.

            Si el mapa no carga, su aviso lo ocupa entero y taparía el panel,
            que tiene la lista: la alternativa al mapa. Ahí el panel deja de
            flotar y va antes del mapa, en una columna que se desplaza si no
            entran los dos.
        -->
        <BottomSheet
            ref="sheet"
            v-model:snap="sheetSnap"
            :docked="mapFailed"
            class="z-10 rounded-veni-md border border-line bg-canvas/95 shadow-lg"
            :class="
                mapFailed
                    ? 'mx-3 mt-3 shrink-0 md:mx-4 md:mt-4 md:w-[calc(100%_-_2rem)] md:max-w-sm'
                    : 'absolute inset-x-2 bottom-[calc(var(--veni-attribution-clearance)_+_var(--veni-update-prompt-space,0px))] h-(--sheet-height) md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:h-auto md:max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_1rem)] md:w-[calc(100%_-_2rem)] md:max-w-sm'
            "
        >
            <!-- El título de la página sigue en el documento aunque el panel muestre otra cosa. -->
            <h1 :class="panelParts && (selected || listOpen) ? 'sr-only' : 'text-lg md:text-2xl'">{{ t('home.heading') }}</h1>

            <RestaurantSummary
                v-if="selected && panelParts"
                :key="selected.slug"
                :restaurant="selected"
                :directions-open="directionsOpen"
                @close="closeSummary"
                @directions="openDirections"
                @close-directions="closeDirections"
            >
                <RouteDirections
                    :state="shownRouteState"
                    :profile="profile"
                    :destination="selected.coordinates"
                    @profile="profile = $event"
                    @retry="retryDirections"
                />
                <!-- Si su panel no bajó (sin señal), queda cómo pedirlo de nuevo. -->
                <div v-if="routeParts === null && routeState.status === 'offline'" class="mt-1" data-directions>
                    <p role="status" class="text-sm" data-route-status>{{ t('directions.offline') }}</p>
                    <button
                        type="button"
                        class="mt-2 inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold transition-colors hover:bg-surface"
                        @click="retryDirections"
                    >
                        {{ t('directions.retry') }}
                    </button>
                </div>
            </RestaurantSummary>

            <RestaurantList v-else-if="listOpen && panelParts" :restaurants="restaurants" :distances="distances" @select="selectFromList" @close="closeList" />

            <template v-else>
                <!--
                    En el celular, con restaurantes en el mapa, la bienvenida
                    entra en el panel asomado: el título y «Ver la lista». La
                    presentación y cuántos hay quedan para el lector de pantalla.
                -->
                <p class="mt-1 text-sm text-ink-muted" :class="{ 'max-md:hidden': hasRestaurants }">{{ t('home.intro') }}</p>

                <div class="mt-3 border-t border-line pt-3 text-sm" :class="{ 'max-md:mt-0 max-md:border-0 max-md:pt-0': hasRestaurants }">
                    <!-- Siempre en la página: el lector de pantalla anuncia cuando cambia. -->
                    <p
                        ref="statusRegion"
                        role="status"
                        tabindex="-1"
                        class="focus:outline-none"
                        :class="{ 'sr-only': status === 'error', 'max-md:sr-only': hasRestaurants, 'motion-safe:animate-pulse': status === 'loading' }"
                        :aria-busy="status === 'loading'"
                    >
                        {{ statusMessage }}
                    </p>

                    <div v-if="status === 'error'" role="alert" class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                        <p class="grow basis-48">{{ t('restaurants.error') }}</p>
                        <button
                            type="button"
                            class="inline-flex min-h-touch items-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco transition-colors hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                            @click="retryRestaurants"
                        >
                            {{ t('restaurants.retry') }}
                        </button>
                    </div>

                    <div v-else-if="hasRestaurants" class="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            ref="listButton"
                            type="button"
                            class="inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 font-semibold transition-colors hover:bg-surface"
                            @click="openList"
                        >
                            <Icon name="menu-hamburguesa" :size="20" />
                            {{ t('restaurants.show_list') }}
                        </button>
                        <SampleDataBadge v-if="hasSampleData" />
                    </div>
                </div>
            </template>
        </BottomSheet>

        <!--
            Sin mapa, su aviso se queda con el alto que deja el panel, y nunca
            con menos del que necesita. Con mapa, el panel va encima: al
            ubicarse, la cámara deja la ubicación fuera de él.
        -->
        <MapView ref="mapView" :overlay="mapFailed ? null : panel" :class="{ 'min-h-56': mapFailed }" @status="mapFailed = $event === 'error'">
            <RestaurantsLayer :restaurants="restaurants" :selected="selectedSlug" @select="selectFromMap" />
            <!-- Las distancias de la lista: la ubicación queda dentro, solo salen los metros. -->
            <RestaurantDistances v-if="listOpen" :restaurants="restaurants" @distances="distances = $event" />
            <RouteLayer
                v-if="directionsOpen && selected"
                :key="selected.slug"
                :destination="selected.coordinates"
                :profile="profile"
                :attempt="routeAttempt"
                @state="routeState = $event"
            />
        </MapView>
    </div>
</template>
