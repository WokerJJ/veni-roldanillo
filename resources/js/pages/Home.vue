<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import MapView from '@/components/MapView.vue';
import RestaurantList from '@/components/RestaurantList.vue';
import RestaurantsLayer from '@/components/RestaurantsLayer.vue';
import RestaurantSummary from '@/components/RestaurantSummary.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import { useI18n } from '@/composables/useI18n';
import { useRestaurants } from '@/restaurants/useRestaurants';

// El mapa ocupa todo el alto bajo la cabecera: el layout va sin pie de página.
defineOptions({ layout: { immersive: true } });

const { t } = useI18n();
const { status, restaurants, retry } = useRestaurants();

/** Slug del restaurante con el resumen abierto. */
const selectedSlug = ref<string | null>(null);
const listOpen = ref(false);
/** De dónde se abrió el resumen: al cerrarlo, el foco vuelve ahí. */
let openedFromList = false;

const selected = computed(() => restaurants.value.find(({ slug }) => slug === selectedSlug.value) ?? null);
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

function retryRestaurants(): void {
    // El botón desaparece al reintentar: el foco pasa al estado, que dice «Cargando…».
    statusRegion.value?.focus();
    retry();
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

    <div class="absolute inset-0">
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
            por dentro. En el celular vertical tampoco llega a los botones de
            zoom (arriba a la derecha, 10 px de margen y dos de 44 px): deja
            7rem libres arriba.
        -->
        <section
            class="absolute inset-x-3 bottom-[calc(var(--veni-attribution-clearance)_+_var(--veni-update-prompt-space,0px))] z-10 flex max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_var(--veni-update-prompt-space,0px)_-_7rem)] flex-col rounded-veni-md border border-line bg-canvas/95 p-4 shadow-lg min-[480px]:inset-x-auto min-[480px]:top-4 min-[480px]:bottom-auto min-[480px]:left-4 min-[480px]:max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_1rem)] min-[480px]:w-[calc(100%_-_2rem)] min-[480px]:max-w-sm"
        >
            <!-- El título de la página sigue en el documento aunque el panel muestre otra cosa. -->
            <h1 :class="selected || listOpen ? 'sr-only' : 'text-xl min-[480px]:text-2xl'">{{ t('home.heading') }}</h1>

            <RestaurantSummary v-if="selected" :key="selected.slug" :restaurant="selected" @close="closeSummary" />

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

        <MapView ref="mapView">
            <RestaurantsLayer :restaurants="restaurants" :selected="selectedSlug" @select="selectFromMap" />
        </MapView>
    </div>
</template>
