<script setup lang="ts">
import { Head, Link, router, usePage } from '@inertiajs/vue3';
import type { Component, FunctionalComponent } from 'vue';
import { computed, h, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';

import BottomSheet from '@/components/BottomSheet.vue';
import Icon from '@/components/Icon.vue';
import type * as Links from '@/components/links';
import MapView from '@/components/MapView.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import type { SheetSnap } from '@/components/sheet';
import { useI18n } from '@/composables/useI18n';
import { DESKTOP_QUERY, useMediaQuery } from '@/composables/useMediaQuery';
import { homeList, homeListRequest, published, SETTINGS } from '@/navigation/tabs';
// Solo los tipos: buscar, filtrar y sortear bajan con la lista (ADR 0028).
import type { Filters } from '@/restaurants/filterParams';
import type * as Finder from '@/restaurants/finder';
import { SELECTED_PARAM, selectedFromUrl } from '@/restaurants/links';
import { hasListParams } from '@/restaurants/listParams';
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
| tanto el panel sigue con la bienvenida; si no bajan, lo dice y deja
| volver a pedirlos.
*/
const panelParts = shallowRef<{ summary: Component; list: Component; distances: Component; welcome: Component; links: typeof Links; sidebar: Component } | null>(null);
let loadingPanelParts = false;
const panelPartsFailed = ref(false);

const RestaurantSummary: FunctionalComponent = (_props, { attrs, slots }) => (panelParts.value ? h(panelParts.value.summary, attrs, slots) : null);
/** La lista que bajó: al volver de un resumen, le devuelve el foco al botón de ese restaurante. */
const list = shallowRef<{ focusItem: (slug: string) => void } | null>(null);
const RestaurantList: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.list, { ...attrs, ref: list }) : null);
const RestaurantDistances: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.distances, attrs) : null);
const WelcomeActions: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.welcome, attrs) : null);
const LegalLinks: FunctionalComponent = (_props, { attrs }) => (panelParts.value ? h(panelParts.value.links.LegalLinks, attrs) : null);
/** «Ajustes» (#139): el idioma y el tema, que el layout comparte (navigation/tabs.ts). */
const settingsControls = inject(SETTINGS, []);
const SettingsMenu: FunctionalComponent = (_props, { attrs }) =>
    panelParts.value ? h(panelParts.value.links.SettingsMenu, attrs, () => settingsControls.map((control) => h(control))) : null;
/** Lo de la barra lateral de computador (ADR 0037): la lista con el resumen del elegido. */
const HomeSidebar: FunctionalComponent = (_props, { attrs, slots }) => (panelParts.value ? h(panelParts.value.sidebar, { ...attrs, ref: list }, slots) : null);

/*
| La búsqueda y los filtros (#12, ADR 0028) viven en la dirección, como el
| elegido, y se aplican a la lista y al mapa a la vez: los aplican la lista y
| la capa, que bajan aparte. Leerlos y escribirlos también baja aparte (con
| la lista): hasta entonces `filters` es null y la dirección no se toca.
*/
const finder = shallowRef<typeof Finder | null>(null);
const filters = shallowRef<Filters | null>(null);

/*
| Los restaurantes sobre el mapa no se ven hasta que llega MapLibre, que baja
| aparte y pesa mucho más: su capa baja apenas monta el inicio, junto con el
| motor, y no con el arranque (ADR 0022). Si no bajó, se vuelve a pedir
| cuando se pide el panel.
*/
const restaurantsLayer = shallowRef<Component | null>(null);
let requestedRestaurantsLayer = false;
/** La capa que bajó: la cámara deja a la vista al elegido cuando el panel termina de moverse. */
const layer = shallowRef<{ reveal: () => void } | null>(null);
const RestaurantsOnMap: FunctionalComponent = (_props, { attrs }) =>
    restaurantsLayer.value ? h(restaurantsLayer.value, { ...attrs, ref: layer }) : null;

function loadRestaurantsLayer(): void {
    // Pedida o ya aquí: no se vuelve a pedir.
    if (requestedRestaurantsLayer) {
        return;
    }

    requestedRestaurantsLayer = true;
    import('@/components/RestaurantsLayer.vue')
        .then((module) => {
            restaurantsLayer.value = module.default;
        })
        .catch((error: unknown) => {
            console.error('[inicio] No se pudieron cargar los restaurantes del mapa.', error);
            requestedRestaurantsLayer = false;
        });
}

function loadPanelParts(): void {
    loadRestaurantsLayer();

    if (panelParts.value !== null || loadingPanelParts) {
        return;
    }

    loadingPanelParts = true;
    panelPartsFailed.value = false;
    Promise.all([
        import('@/components/RestaurantSummary.vue'),
        import('@/components/RestaurantList.vue'),
        import('@/components/RestaurantDistances.vue'),
        import('@/components/WelcomeActions.vue'),
        import('@/components/links'),
        import('@/restaurants/finder'),
        import('@/components/HomeSidebar.vue'),
    ])
        .then(([summary, list, distances, welcome, links, finderModule, sidebar]) => {
            finder.value = finderModule;
            filters.value ??= finderModule.filtersFromUrl(page.url);
            // La dirección ya abrió la lista: la bienvenida no la vuelve a abrir,
            // aunque la hayan cerrado antes de que bajara este chunk.
            if (listFromAddress) {
                listFromAddress = false;
                finderModule.opensListFromUrl(filters.value);
            }
            panelParts.value = {
                summary: summary.default,
                list: list.default,
                distances: distances.default,
                welcome: welcome.default,
                links,
                sidebar: sidebar.default,
            };
        })
        .catch((error: unknown) => {
            // Sin señal y sin la PWA guardada: se vuelve a pedir con «Reintentar», al tocar un restaurante o con «Ver la lista».
            console.error('[inicio] No se pudo cargar el resumen ni la lista.', error);
            panelPartsFailed.value = true;
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
/**
 * En computador (desde 1024 px, ADR 0037) el panel no flota: es una barra
 * lateral fija con el título, la lista con su buscador siempre a la vista y
 * una línea con los créditos y los documentos, y el mapa
 * ocupa el resto. El resumen del elegido va dentro de la lista, debajo de su
 * fila. Por debajo, el panel de abajo o el lateral de siempre (ADR 0022).
 *
 * La barra es el mismo panel (BottomSheet) con `docked`, una región con
 * nombre: sin manija ni alturas, a todo el alto y antes del mapa en el
 * documento, así el foco la recorre primero. No se desplaza entera: arriba,
 * fijos, el título, el subtítulo y el buscador con «Sugerime algo» y el botón
 * de los filtros; en el medio, lo único que se desplaza (la lista: el panel
 * de los filtros si está abierto, almuerzos, filas, favoritos); abajo, la línea chica del pie. El mapa no
 * lleva nada encima (`overlay` null): la cámara usa todo su ancho y MapLibre
 * sigue el tamaño de su contenedor al cambiar de diseño. Cuántos hay lo dice
 * la lista; el buscador y los botones de la bienvenida no se muestran,
 * porque la lista ya está a la vista. Lo que no hace falta para el primer
 * pintado (la lista y el resumen) baja aparte, con la lista (HomeSidebar.vue
 * y components/links.ts). La guía de platos va en la navegación de la
 * cabecera (#130); en el celular, en la barra de pestañas (#139).
 */
const desktop = useMediaQuery(DESKTOP_QUERY);

/** Slug del restaurante con el resumen abierto. */
const selectedSlug = ref<string | null>(null);
/**
 * La lista abierta en el panel, y dónde toma el foco al abrirse: su título,
 * «Almuerzos de hoy» o el buscador; `false`, cerrada. Es la misma que ve la
 * barra de pestañas del celular (#139, ADR 0041, navigation/tabs.ts): la
 * barra la abre y la cierra, y marca su pestaña con ella.
 */
const listOpen = homeList;
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

/** El inicio abrió la lista porque la dirección traía filtros: al bajar finder.ts se consume ese «una vez». */
let listFromAddress = false;

/** El restaurante hasta el que se pidió la ruta (siempre el elegido), o null. */
const directionsFor = ref<string | null>(null);
const profile = ref<RouteProfile>('foot');
const routeState = ref<RouteState>({ status: 'locating' });
/** Sube con «Volver a intentar»: la capa de la ruta lo vuelve a pedir. */
const routeAttempt = ref(0);

const selected = computed(() => restaurants.value.find(({ slug }) => slug === selectedSlug.value) ?? null);
/** La lista está a la vista: abierta en el panel, o siempre en la barra lateral. */
const listShown = computed(() => listOpen.value || desktop.value);
const directionsOpen = computed(() => selected.value !== null && directionsFor.value === selected.value.slug);
/** Sin mapa no hay ubicación ni dónde dibujar: el panel solo ofrece las otras apps. */
const shownRouteState = computed<RouteState>(() => (mapFailed.value ? { status: 'unavailable' } : routeState.value));
const hasRestaurants = computed(() => status.value === 'ready' && restaurants.value.length > 0);
const hasSampleData = computed(() => restaurants.value.some(({ fictitious }) => fictitious));

/**
 * Cómo va el panel: la barra lateral de computador (`sidebar`), antes del
 * mapa y sin flotar cuando el mapa no cargó en el celular (`docked`, su
 * aviso lo taparía: van en una columna que se desplaza si no entran los dos),
 * o flotando encima del mapa (`floating`): el panel de abajo en un celular
 * vertical (`sheet:`, ADR 0022), que deja libre la barra de pestañas (#139)
 * y se corre encima del aviso de versión nueva, o al costado (`side:`),
 * arriba a la izquierda, sin pasar del alto del mapa. Sólido (#139, ADR
 * 0041): al 95 % se veían los marcadores y las calles detrás del texto.
 *
 * Con la lista, el panel flotante ocupa toda la pantalla, de borde a borde,
 * como una pestaña de iOS (#139): lo dice el CSS de la barra de pestañas
 * (`.veni-full-list`, TabBar.vue), que lo reconoce porque muestra la lista o
 * sus siluetas, y no viaja en el arranque. El mapa sigue montado debajo (no
 * recarga sus teselas), oculto para la vista, el foco y el lector.
 */
const layout = computed(() => (desktop.value ? 'sidebar' : mapFailed.value ? 'docked' : 'floating'));
const LAYOUTS = {
    sidebar: {
        page: 'flex',
        sheet: 'w-full max-w-sm shrink-0 bg-canvas shadow-lg',
        map: 'min-w-0 flex-1',
        footer: 'mt-auto flex shrink-0 flex-wrap items-center gap-x-2 pt-2 text-xs text-ink-muted',
    },
    docked: {
        page: 'flex flex-col overflow-y-auto',
        sheet: 'mx-3 mt-3 shrink-0 rounded-veni-md border border-line bg-canvas shadow-lg md:mx-4 md:mt-4 md:w-[calc(100%_-_2rem)] md:max-w-sm',
        map: 'min-h-56',
        footer: 'contents',
    },
    floating: {
        page: '',
        sheet: 'absolute inset-x-2 bottom-[calc(var(--veni-tabbar-space)_+_var(--veni-update-prompt-space,0px))] max-h-(--sheet-height) rounded-veni-lg border border-line bg-canvas shadow-lg veni-safe-side side:inset-x-auto side:top-4 side:bottom-auto side:left-4 side:max-h-[calc(100%_-_var(--veni-tabbar-space)_-_1rem)] side:w-[calc(100%_-_2rem)] side:max-w-sm',
        map: '',
        footer: 'contents',
    },
} as const;
const classes = computed(() => LAYOUTS[layout.value]);

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
const sheet = useTemplateRef<{ root: HTMLElement | null; settled: () => Promise<void> }>('sheet');
/** El panel encima del mapa: el motor mide cuánto lo tapa (ADR 0019). */
const panel = computed(() => sheet.value?.root ?? null);

/**
 * La altura del panel de abajo en el celular (ADR 0022). Cada vez que cambia
 * lo que muestra, toma la suya: asomado para la bienvenida con restaurantes
 * (el mapa a la vista), a media altura para la lista, el resumen y la ruta, y
 * para los avisos que piden leerse (sin restaurantes o sin conexión). Desde
 * ahí, quien usa la app la cambia con la manija.
 */
// Abierta con la lista (la barra de pestañas la pidió desde otra página), a la altura completa.
const sheetSnap = ref<SheetSnap>(listOpen.value === false ? 'peek' : 'full');
const panelView = computed(() => {
    if (selected.value) {
        return directionsOpen.value ? 'route' : 'summary';
    }

    if (listOpen.value && status.value !== 'error' && !panelPartsFailed.value) {
        return 'list';
    }

    return status.value === 'error' || (status.value === 'ready' && !hasRestaurants.value) || panelPartsFailed.value ? 'notice' : 'welcome';
});

// La lista, a la altura completa (#138, A2): a media altura entraban dos o tres filas.
watch(panelView, (view) => {
    sheetSnap.value = view === 'welcome' ? 'peek' : view === 'list' ? 'full' : 'half';
});

/** La lista pedida que todavía no llegó (los restaurantes o su chunk): sus siluetas. */
const listLoading = computed(() => listOpen.value && !desktop.value && (status.value === 'loading' || (panelParts.value === null && !panelPartsFailed.value)));

/** «Sugerime algo» sin abiertos lo dice en la bienvenida: asomado no se vería. */
function expandSheet(): void {
    if (sheetSnap.value === 'peek') {
        sheetSnap.value = 'half';
    }
}

function openList(start: 'heading' | 'lunches' | 'search' = 'heading'): void {
    loadPanelParts();
    listOpen.value = start;
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

    if (openedFromList && listShown.value && list.value) {
        // Al botón de ese restaurante en la lista; si ya no está, a su título.
        list.value.focusItem(slug);
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

    if (filters.value !== null) {
        finder.value?.writeFilters(searchParams, filters.value);
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
    } else if (listOpen.value && !desktop.value) {
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
    const url = withSelected(page.url, slug);

    if (!(finder.value?.sameAddress(url, page.url) ?? url === page.url)) {
        router.replace({ url, preserveScroll: true, preserveState: true });
    }
}

// Los filtros cambian la dirección igual que el elegido; al escribir en el
// buscador, cuando se deja de teclear. Mientras espera la lista, el elegido
// que pide la dirección se queda en ella.
let filtersTimer: ReturnType<typeof setTimeout> | undefined;

watch(filters, () => {
    clearTimeout(filtersTimer);
    filtersTimer = setTimeout(() => {
        syncUrl(requestedSlug ?? selectedSlug.value);
    }, 300);
});

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

// Otro elegido: el panel cambia de alto después de que la cámara fue hasta
// él, y tarda lo que su transición. Cuando ya lo tiene, la cámara lo deja a
// la vista de lo que queda (RestaurantsLayer).
watch(selectedSlug, async (slug) => {
    if (slug === null) {
        return;
    }

    await nextTick();
    await sheet.value?.settled();

    if (selectedSlug.value === slug) {
        layer.value?.reveal();
    }
});

// La lista se volvió a pedir (otro idioma) y el elegido ya no está: se cierra su resumen.
watch(selected, (restaurant) => {
    if (restaurant === null && selectedSlug.value !== null) {
        void closeSummary();
    }
});

// Cerrada la lista, sus distancias se olvidan: la próxima vez se calculan de nuevo.
watch(listShown, (open) => {
    if (!open) {
        distances.value = null;
    }
});

// Cada orden de la barra de pestañas de mostrar la lista (#139) deja el
// elegido, aunque la lista ya estuviera abierta: es la orden, no el valor, lo
// que se vigila (navigation/tabs.ts). La bienvenida la abre sin elegido, y al
// volver al celular con filtros se abre sin orden, debajo del elegido, que sigue.
watch(homeListRequest, () => {
    if (listOpen.value !== false) {
        selectedSlug.value = null;
    }
});

// Sin restaurantes no hay lista que mostrar. La barra de pestañas mira la
// lista publicada para no ofrecer el pedido de uno que ya no está (#139).
watch(restaurants, (current) => {
    published.value = current;

    if (current.length === 0) {
        listOpen.value = false;
    }
});

// Al cruzar 1024 px (girar la tableta, agrandar la ventana) lo de adentro del
// panel se vuelve a montar y el foco caería en <body>. Quedan el elegido, los
// filtros y la ruta; si el foco estaba en el panel, va a lo equivalente: la
// fila del elegido o el buscador en la barra; en el celular, el resumen o la
// lista lo toman al montarse, y si no, «Ver la lista». Con filtros, el
// celular abre la lista: es lo que se estaba mirando.
watch(desktop, async (wide) => {
    // El mismo panel en los dos diseños: cambia lo de adentro.
    const root = panel.value;
    const hadFocus = root?.contains(document.activeElement) === true;

    if (!wide && hasRestaurants.value && filters.value !== null && finder.value?.hasFilters(filters.value)) {
        listOpen.value = 'heading';
    }

    await nextTick();

    if (!hadFocus || (!wide && (selected.value || listOpen.value))) {
        return;
    }

    if (wide && selectedSlug.value !== null && list.value) {
        list.value.focusItem(selectedSlug.value);
    } else {
        (root.querySelector<HTMLElement>('input[type="search"]') ?? listButton.value ?? statusRegion.value)?.focus();
    }
});

onMounted(() => {
    document.addEventListener('keydown', onKeydown);

    // La dirección trae una búsqueda o filtros: la lista se abre enseguida,
    // con sus siluetas (#138, A5); antes esperaba a la bienvenida, que se
    // monta recién con los restaurantes y la lista.
    if (hasListParams(page.url)) {
        listFromAddress = true;
        listOpen.value = 'heading';
    }

    loadPanelParts();
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    clearTimeout(filtersTimer);
    listOpen.value = false;
});
</script>

<template>
    <Head :title="t('home.title')" />

    <div class="absolute inset-0" :class="classes.page">
        <!--
            Panel sobre el mapa (va antes en el documento: el título se lee
            primero). Muestra la bienvenida con el estado de los restaurantes,
            la lista o el resumen del restaurante elegido. Cómo va (abajo, al
            costado, en una columna sin mapa o como barra lateral) lo dice
            `layout`, en el script.
        -->
        <BottomSheet
            ref="sheet"
            v-model:snap="sheetSnap"
            :docked="layout !== 'floating'"
            :role="desktop ? 'region' : undefined"
            :aria-label="desktop ? t('home.sidebar_label') : undefined"
            class="z-10"
            :class="classes.sheet"
        >
            <!-- El título de la página sigue en el documento aunque el panel muestre otra cosa. -->
            <h1 :class="[!desktop && panelParts && (selected || listOpen) ? 'sr-only' : 'text-lg md:text-2xl', { 'sheet:sr-only': hasRestaurants }]">{{ t('home.heading') }}</h1>

            <RestaurantSummary
                v-if="selected && panelParts && !desktop"
                :key="selected.slug"
                :restaurant="selected"
                :directions-open="directionsOpen"
                :route-offline="routeParts === null && routeState.status === 'offline'"
                @close="closeSummary"
                @directions="openDirections"
                @close-directions="closeDirections"
                @retry-directions="retryDirections"
            >
                <RouteDirections
                    :state="shownRouteState"
                    :profile="profile"
                    :destination="selected.coordinates"
                    @profile="profile = $event"
                    @retry="retryDirections"
                />
            </RestaurantSummary>

            <RestaurantList
                v-else-if="listOpen && panelParts && hasRestaurants && !desktop"
                closable
                autofocus
                :restaurants="restaurants"
                :filters="filters"
                :start="listOpen || undefined"
                :distances="distances"
                @update:filters="filters = $event"
                @select="selectFromList"
                @close="closeList"
            />

            <!-- La lista pedida mientras llega: siluetas para la vista y el estado para el lector. -->
            <div v-else-if="listLoading" class="mt-3" data-list-loading>
                <p role="status" class="sr-only">{{ t('restaurants.loading') }}</p>
                <ul aria-hidden="true" class="flex flex-col gap-4">
                    <li v-for="row in 5" :key="row" data-skeleton>
                        <span class="veni-skeleton" />
                        <span class="veni-skeleton" />
                    </li>
                </ul>
            </div>

            <template v-else>
                <!--
                    En el celular, con restaurantes en el mapa, la bienvenida
                    entra en el panel asomado: el buscador y una fila de
                    botones (#139). El título, la presentación y cuántos hay
                    quedan para el lector de pantalla.
                -->
                <p class="mt-1 text-sm text-ink-muted" :class="{ 'sheet:hidden': hasRestaurants }">{{ t('home.intro') }}</p>

                <div class="text-sm" :class="[desktop && hasRestaurants ? 'contents' : 'mt-3 border-t border-line pt-3', { 'sheet:mt-0 sheet:border-0 sheet:pt-0': hasRestaurants }]">
                    <!-- Siempre en la página: el lector de pantalla anuncia cuando cambia. -->
                    <p
                        ref="statusRegion"
                        role="status"
                        tabindex="-1"
                        class="focus:outline-none"
                        :class="{
                            'sr-only': status === 'error' || (desktop && hasRestaurants),
                            'sheet:sr-only': hasRestaurants,
                            'motion-safe:animate-pulse': status === 'loading',
                        }"
                        :aria-busy="status === 'loading'"
                    >
                        {{ statusMessage }}
                    </p>

                    <div v-if="status === 'error'" role="alert" class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                        <p class="grow basis-48">{{ t('restaurants.error') }}</p>
                        <button
                            type="button"
                            class="inline-flex min-h-touch items-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                            @click="retryRestaurants"
                        >
                            {{ t('restaurants.retry') }}
                        </button>
                    </div>

                    <div v-else-if="hasRestaurants && !desktop" class="mt-2 flex flex-wrap items-center gap-2">
                        <!-- El buscador a la vista (#139): abre la lista con el foco en el campo. -->
                        <button
                            ref="listButton"
                            type="button"
                            class="flex min-h-touch w-full items-center gap-2 rounded-full bg-surface px-4 text-ink-muted"
                            data-search-open
                            @click="openList('search')"
                        >
                            <Icon name="buscar" :size="20" />
                            {{ t('home.search_open') }}
                        </button>
                        <!-- «Sugerime algo», «Almuerzos de hoy» y «Quitar filtros»: bajan con la lista. -->
                        <WelcomeActions
                            :restaurants="restaurants"
                            :filters="filters"
                            @select="selectFromMap"
                            @lunches="openList('lunches')"
                            @list="openList()"
                            @update:filters="filters = $event"
                            @expand="expandSheet"
                        />
                        <SampleDataBadge v-if="hasSampleData" />
                    </div>

                    <div v-if="panelPartsFailed" role="alert" class="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2" data-panel-offline>
                        <p class="grow basis-48">{{ t('home.panel_offline') }}</p>
                        <button
                            type="button"
                            class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold hover:bg-surface"
                            @click="loadPanelParts"
                        >
                            {{ t('restaurants.retry') }}
                        </button>
                    </div>
                </div>

                <HomeSidebar
                    v-if="desktop && hasRestaurants"
                    class="min-h-0 flex-1"
                    :restaurants="restaurants"
                    :filters="filters"
                    :distances="distances"
                    :selected="selected"
                    :directions-open="directionsOpen"
                    :route-offline="routeParts === null && routeState.status === 'offline'"
                    @update:filters="filters = $event"
                    @select="selectFromList"
                    @close="closeSummary"
                    @directions="openDirections"
                    @close-directions="closeDirections"
                    @retry-directions="retryDirections"
                >
                    <RouteDirections
                        v-if="selected"
                        :state="shownRouteState"
                        :profile="profile"
                        :destination="selected.coordinates"
                        @profile="profile = $event"
                        @retry="retryDirections"
                    />
                </HomeSidebar>

                <!-- El inicio no tiene pie: los créditos de OpenStreetMap (ADR 0021) van en la bienvenida. -->
                <div :class="classes.footer" data-sidebar-footer>
                    <Link
                        href="/credits"
                        class="inline-flex min-h-touch items-center self-start text-ink-muted underline"
                        :class="{ 'mt-1 text-sm': !desktop }"
                        :aria-label="desktop ? t('credits.link') : undefined"
                        data-credits
                    >
                        {{ desktop ? t('credits.link_short') : t('credits.link') }}
                    </Link>
                    <LegalLinks short :inline="desktop" :class="{ 'text-sm text-ink-muted': !desktop }" />
                    <!-- El idioma y el tema: en el mapa del celular no hay cabecera (#139). -->
                    <SettingsMenu v-if="!desktop" />
                </div>
            </template>
        </BottomSheet>

        <!--
            Sin mapa, su aviso se queda con el alto que deja el panel, y nunca
            con menos del que necesita. Con mapa, el panel va encima: al
            ubicarse, la cámara deja la ubicación fuera de él.
        -->
        <MapView ref="mapView" :overlay="layout === 'floating' ? panel : null" :class="classes.map" @status="mapFailed = $event === 'error'">
            <RestaurantsOnMap :restaurants="restaurants" :filters="filters" :selected="selectedSlug" @select="selectFromMap" />
            <!-- Las distancias de la lista: la ubicación queda dentro, solo salen los metros. -->
            <RestaurantDistances v-if="listShown" :restaurants="restaurants" @distances="distances = $event" />
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
