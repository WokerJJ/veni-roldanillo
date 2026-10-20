<script setup lang="ts">
import { Head, router, usePage } from '@inertiajs/vue3';
import type { Component, FunctionalComponent } from 'vue';
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import MapView from '@/components/MapView.vue';
import RestaurantList from '@/components/RestaurantList.vue';
import RestaurantsLayer from '@/components/RestaurantsLayer.vue';
import RestaurantSummary from '@/components/RestaurantSummary.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
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
const list = useTemplateRef<{ focusItem: (slug: string) => Promise<void> }>('list');
const listButton = useTemplateRef<HTMLButtonElement>('listButton');
const statusRegion = useTemplateRef<HTMLElement>('statusRegion');
const panel = useTemplateRef<HTMLElement>('panel');

function selectFromMap(slug: string): void {
    openedFromList = false;
    selectedSlug.value = slug;
}

function selectFromList(slug: string): void {
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
        await list.value?.focusItem(slug);
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

// Sin restaurantes no hay lista que mostrar.
watch(restaurants, (current) => {
    if (current.length === 0) {
        listOpen.value = false;
    }
});

onMounted(() => {
    document.addEventListener('keydown', onKeydown);
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
            la lista o el resumen del restaurante elegido. En un celular
            vertical queda abajo, a lo ancho, y deja libre la franja de la
            atribución de OpenStreetMap (la misma holgura que el aviso de
            versión nueva) y, si ese aviso se ve, se corre encima de él
            (UpdatePrompt.vue); desde 480 px de ancho (también un celular
            acostado, que es bajo) queda arriba a la izquierda, sin tocar los
            botones de zoom. Nunca pasa del alto del mapa: la lista se desplaza
            por dentro. En el celular vertical tampoco llega a los botones del
            mapa (arriba a la derecha: 10 px de margen, los dos de zoom de
            44 px, otros 10 y el de «¿Dónde estoy?», 152 px): deja 10rem
            libres arriba.

            Si el mapa no carga, su aviso lo ocupa entero y taparía el panel,
            que tiene la lista: la alternativa al mapa. Ahí el panel deja de
            flotar y va antes del mapa, en una columna que se desplaza si no
            entran los dos.
        -->
        <section
            ref="panel"
            class="z-10 flex flex-col rounded-veni-md border border-line bg-canvas/95 p-4 shadow-lg"
            :class="[
                mapFailed
                    ? 'mx-3 mt-3 shrink-0 min-[480px]:mx-4 min-[480px]:mt-4 min-[480px]:w-[calc(100%_-_2rem)] min-[480px]:max-w-sm'
                    : 'absolute inset-x-3 bottom-[calc(var(--veni-attribution-clearance)_+_var(--veni-update-prompt-space,0px))] max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_var(--veni-update-prompt-space,0px)_-_10rem)] min-[480px]:inset-x-auto min-[480px]:top-4 min-[480px]:bottom-auto min-[480px]:left-4 min-[480px]:max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_1rem)] min-[480px]:w-[calc(100%_-_2rem)] min-[480px]:max-w-sm',
                // Con la ruta abierta el panel crece: se desplaza por dentro, sin pasar de su alto.
                { 'overflow-y-auto': directionsOpen },
            ]"
        >
            <!-- El título de la página sigue en el documento aunque el panel muestre otra cosa. -->
            <h1 :class="selected || listOpen ? 'sr-only' : 'text-xl min-[480px]:text-2xl'">{{ t('home.heading') }}</h1>

            <RestaurantSummary
                v-if="selected"
                :key="selected.slug"
                :restaurant="selected"
                :directions-open="directionsOpen"
                @close="closeSummary"
                @directions="openDirections"
            >
                <RouteDirections
                    :state="shownRouteState"
                    :profile="profile"
                    :destination="selected.coordinates"
                    @profile="profile = $event"
                    @retry="retryDirections"
                    @close="closeDirections"
                />
                <!-- Si su panel no bajó (sin señal), queda cómo pedirlo de nuevo. -->
                <div v-if="routeParts === null && routeState.status === 'offline'" class="mt-3 border-t border-line pt-3" data-directions>
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

            <RestaurantList v-else-if="listOpen" ref="list" :restaurants="restaurants" @select="selectFromList" @close="closeList" />

            <template v-else>
                <!-- En un celular vertical, con restaurantes en el mapa, la presentación les deja el lugar: el panel tapa menos. -->
                <p class="mt-1 text-sm text-ink-muted" :class="{ 'max-[479px]:hidden': hasRestaurants }">{{ t('home.intro') }}</p>

                <div class="mt-3 border-t border-line pt-3 text-sm">
                    <!-- Siempre en la página: el lector de pantalla anuncia cuando cambia. -->
                    <p
                        ref="statusRegion"
                        role="status"
                        tabindex="-1"
                        class="focus:outline-none"
                        :class="{ 'sr-only': status === 'error', 'motion-safe:animate-pulse': status === 'loading' }"
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
                            @click="listOpen = true"
                        >
                            <Icon name="menu-hamburguesa" :size="20" />
                            {{ t('restaurants.show_list') }}
                        </button>
                        <SampleDataBadge v-if="hasSampleData" />
                    </div>
                </div>
            </template>
        </section>

        <!--
            Sin mapa, su aviso se queda con el alto que deja el panel, y nunca
            con menos del que necesita. Con mapa, el panel va encima: al
            ubicarse, la cámara deja la ubicación fuera de él.
        -->
        <MapView ref="mapView" :overlay="mapFailed ? null : panel" :class="{ 'min-h-56': mapFailed }" @status="mapFailed = $event === 'error'">
            <RestaurantsLayer :restaurants="restaurants" :selected="selectedSlug" @select="selectFromMap" />
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
