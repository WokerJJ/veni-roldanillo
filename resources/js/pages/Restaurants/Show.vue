<script setup lang="ts">
import { Head, Link, router } from '@inertiajs/vue3';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import FavoriteButton from '@/components/FavoriteButton.vue';
import Icon from '@/components/Icon.vue';
import OrderBar from '@/components/OrderBar.vue';
import RestaurantContact from '@/components/RestaurantContact.vue';
import RestaurantDelivery from '@/components/RestaurantDelivery.vue';
import RestaurantHours from '@/components/RestaurantHours.vue';
import RestaurantMenu from '@/components/RestaurantMenu.vue';
import RestaurantPromotions from '@/components/RestaurantPromotions.vue';
import SampleDataBadge from '@/components/SampleDataBadge.vue';
import type { PageMeta } from '@/composables/useI18n';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatDate } from '@/i18n/intl';
import { categoryIcon } from '@/icons/food';
import { mapUrl, restaurantUrl } from '@/restaurants/links';
import { openStatus } from '@/restaurants/openStatus';
import type { RestaurantProfile } from '@/restaurants/profile';
import { hasContactInfo } from '@/restaurants/profile';
import { openStatusText } from '@/restaurants/statusText';
import { askDirections } from '@/routing/intent';

/**
 * La ficha de un restaurante (#13, ADR 0018): GET /restaurants/{slug}. Lo que
 * muestra llega en `restaurant`, una lista blanca que arma el servidor
 * (App\Http\Resources\RestaurantProfile); `meta` trae el título y la
 * descripción del documento, que el servidor ya escribió en el HTML.
 *
 * «Abierto ahora» no viene del servidor: se calcula aquí con el horario de
 * las props y el mismo módulo que usa el mapa (openStatus.ts, ADR 0017), y se
 * pone al día solo mientras la página siga abierta.
 *
 * Las props sí envejecen: una app instalada pasa horas abierta sin volver a
 * montarse. Cuando la pestaña vuelve del fondo con props de más de un minuto
 * se piden otra vez, como la lista del mapa (useRestaurants.ts): el
 * restaurante pudo cambiar el menú o el horario, o la ficha ocultarse.
 */
const { restaurant, meta } = defineProps<{
    restaurant: RestaurantProfile;
    meta: PageMeta;
}>();

/** Lo que duran las props a la vista: el mismo minuto que la lista del mapa. */
const FRESH_FOR_MS = 60_000;

const { t, locale } = useI18n();
const now = useNow();

const status = computed(() => openStatus(restaurant, now.value));
const statusText = computed(() => openStatusText(status.value, t, locale.value));
// El aviso de demora (#18) se va solo al vencer, con el mismo reloj.
const delayActive = computed(
    () =>
        restaurant.delay_minutes !== null &&
        restaurant.delay_until !== null &&
        Date.parse(restaurant.delay_until) > now.value.getTime(),
);

/**
 * Desde 1024 px la ficha va en dos columnas (#125, ADR 0038): el menú a la
 * izquierda y, a la derecha y fija, lo que se consulta de un vistazo. Lo que
 * se ve lo decide el CSS; dónde se montan el contacto y los domicilios (en la
 * columna de la derecha o después del menú) se decide aquí, como el inicio
 * (ADR 0037).
 *
 * Es la consulta de DESKTOP_QUERY (composables/useMediaQuery.ts), escrita
 * aquí a propósito: si la ficha importara useMediaQuery, el empaquetador lo
 * pasaría a un chunk compartido con el inicio y el arranque sumaría 0,06 kB
 * en importaciones (ADR 0038). Son cuatro líneas; una prueba comprueba que
 * las dos consultas son la misma.
 */
const desktopMedia = window.matchMedia('(min-width: 64rem)');
const desktop = ref(desktopMedia.matches);

/** Las secciones que cambian de columna con el ancho, y lo que en ellas recibe el foco. */
const MOVING_SECTIONS = ['ficha-contacto', 'ficha-domicilios'];
const FOCUSABLE = 'a[href], button, summary, [tabindex]';

/**
 * Al cruzar los 1024 px, el contacto y los domicilios se desmontan en una
 * columna y se montan en la otra: si el foco estaba ahí, se perdería en
 * <body>. Vuelve a lo mismo en la sección nueva (el mismo enlace, por su
 * posición), o a la sección (BUG-036).
 */
const onWidth = (event: MediaQueryListEvent): void => {
    const focused = document.activeElement;
    const section = MOVING_SECTIONS.map((id) => document.getElementById(id)).find((element) => element !== null && element.contains(focused));
    const index = section ? [...section.querySelectorAll(FOCUSABLE)].indexOf(focused as Element) : -1;

    desktop.value = event.matches;

    if (section) {
        void nextTick(() => {
            const moved = document.getElementById(section.id);

            (moved?.querySelectorAll<HTMLElement>(FOCUSABLE)[index] ?? moved)?.focus();
        });
    }
};

const hasContact = computed(() => hasContactInfo(restaurant));

/**
 * La navegación interna del celular (#82): a qué secciones se salta desde
 * arriba. El horario no va: ya está arriba. Con una sola no hace falta.
 */
const sections = computed(() =>
    [
        { id: 'ficha-promociones', label: t('restaurant.promotions.title'), show: (restaurant.promotions?.length ?? 0) > 0 },
        { id: 'ficha-menu', label: t('restaurant.menu.title'), show: true },
        { id: 'ficha-contacto', label: t('restaurant.contact.title'), show: hasContact.value },
        { id: 'ficha-domicilios', label: t('restaurant.delivery.title'), show: restaurant.delivery.available },
    ].filter(({ show }) => show),
);

/** Cuándo llegaron las props que se ven, por el reloj del dispositivo. */
let loadedAt = Date.now();

const onVisible = (): void => {
    if (document.visibilityState !== 'visible' || Date.now() - loadedAt <= FRESH_FOR_MS) {
        return;
    }

    router.reload({
        only: ['restaurant', 'meta'],
        onSuccess: () => {
            loadedAt = Date.now();
        },
        // La ficha ya no está (se ocultó): se pide como una página normal y
        // el servidor responde su página de error. Con cualquier otro error
        // se queda la ficha que había. false: sin el diálogo de Inertia.
        onHttpException: (response) => {
            if (response.status === 404) {
                window.location.reload();
            }

            return false;
        },
        // Sin señal se queda la que había; al volver otra vez, se reintenta.
        onNetworkError: () => false,
    });
};

/**
 * La ruta se deja pedida solo si el mapa se abre en esta pestaña: con Ctrl,
 * Cmd, Shift, Alt o otro botón el navegador lo abre aparte, y esta página
 * quedaría con un pedido que nadie usó.
 */
function onDirectionsClick(event: MouseEvent): void {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        askDirections(restaurant.slug);
    }
}

onMounted(() => {
    document.addEventListener('visibilitychange', onVisible);
    desktopMedia.addEventListener('change', onWidth);
});

onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible);
    desktopMedia.removeEventListener('change', onWidth);
});
</script>

<template>
    <Head :title="meta.title" />

    <div class="ficha px-4 pt-2 pb-10">
        <Link href="/" class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold hover:bg-surface" data-back>
            <Icon name="chevron-izquierda" :size="20" />
            {{ t('layout.back_to_map') }}
        </Link>

        <article>
            <!--
                Una sola columna en el celular; desde 1024 px, dos (ADR 0038).
                El orden del documento es el mismo en los dos: la cabecera, lo
                de un vistazo (estado, horario de hoy, «Cómo llegar») y el
                menú. En computador lo de un vistazo se ve a la derecha, pero
                va antes del menú: el foco lo alcanza enseguida.
            -->
            <div class="ficha-grid">
                <header class="ficha-head mt-2">
                    <!-- Solo la recibe quien puede verla oculta: que no la tome por publicada. -->
                    <p v-if="restaurant.hidden" class="mb-3 flex items-start gap-2 rounded-veni-sm border border-line bg-surface p-3 text-sm" data-hidden>
                        <Icon name="informacion" :size="20" class="shrink-0" />
                        <span>{{ t('restaurant.hidden') }}</span>
                    </p>

                    <h1 tabindex="-1" class="text-2xl leading-tight wrap-anywhere min-[480px]:text-3xl">{{ restaurant.name }}</h1>

                    <div v-if="restaurant.fictitious || restaurant.categories.length > 0" class="mt-2 flex flex-wrap items-center gap-1.5">
                        <SampleDataBadge v-if="restaurant.fictitious" />
                        <ul v-if="restaurant.categories.length > 0" class="flex flex-wrap gap-1.5" :aria-label="t('restaurants.categories')">
                            <li
                                v-for="category in restaurant.categories"
                                :key="category.slug"
                                class="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-sm"
                                :data-category="category.slug"
                            >
                                <Icon :name="categoryIcon(category.slug)" :size="16" />
                                {{ category.name }}
                            </li>
                        </ul>
                    </div>
                </header>

                <!--
                    En computador la columna es fija y, si no cabe, se desplaza
                    por dentro: con tabindex el teclado la alcanza para
                    desplazarla (WCAG 2.1.1), y una región con nombre dice qué
                    es al enfocarla. En el celular es parte de la página: nada
                    de eso (ADR 0038).
                -->
                <div
                    class="ficha-aside"
                    :tabindex="desktop ? 0 : undefined"
                    :role="desktop ? 'region' : undefined"
                    :aria-label="desktop ? t('restaurant.aside') : undefined"
                    data-aside
                >
                    <!-- El estado va en la sección «Horario»: es lo que el horario dice de ahora (EVA-039). -->
                    <RestaurantHours :hours="restaurant.hours" :special-hours="restaurant.special_hours">
                        <p class="mb-1.5 flex items-start gap-2" :class="status.state === 'open' ? 'font-semibold' : 'text-ink-muted'" data-status>
                            <Icon name="reloj" :size="20" class="mt-0.5 shrink-0" />
                            <span>{{ statusText }}</span>
                        </p>
                    </RestaurantHours>

                    <!-- Aviso de demora del panel del dueño (ADR 0025): se va solo cuando vence. -->
                    <p v-if="delayActive" class="mt-1.5 flex items-start gap-2 font-semibold" role="status" data-delay>
                        <Icon name="reloj" :size="20" class="shrink-0" />
                        <span>{{ t('restaurant.delay', { minutes: String(restaurant.delay_minutes) }) }}</span>
                    </p>

                    <!-- En el celular dice arriba que lleva; en computador la sección de domicilios está aquí mismo. -->
                    <p v-if="restaurant.delivery.available && !desktop" class="mt-1.5 flex items-start gap-2" data-delivery>
                        <Icon name="check" :size="20" class="mt-0.5 shrink-0" />
                        <span>{{ t('restaurants.delivery') }}</span>
                    </p>

                    <!--
                        «Cómo llegar» (#11): abre el mapa del inicio con este
                        restaurante elegido (/?r=slug) y la ruta hasta él, que se
                        calcula allá, en el dispositivo. Que se pidió la ruta no va
                        en la dirección (routing/intent.ts): un enlace compartido
                        abre el restaurante sin pedir la ubicación de nadie. Una
                        ficha oculta no está en el mapa: no hay a dónde llevar.
                    -->
                    <div v-if="!restaurant.hidden" class="mt-3 flex flex-wrap gap-2" data-actions>
                        <Link
                            :href="mapUrl(restaurant.slug)"
                            class="inline-flex min-h-touch items-center gap-2 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                            data-directions
                            @click="onDirectionsClick"
                        >
                            <Icon name="ubicacion" :size="20" />
                            {{ t('restaurant.directions') }}
                        </Link>
                        <!-- Favorito (#16): solo el slug, en este teléfono. Una ficha oculta no está en el mapa ni en la lista. -->
                        <FavoriteButton :slug="restaurant.slug" :name="restaurant.name" />
                    </div>

                    <!--
                        En computador, lo que se consulta antes de pedir va en la
                        columna fija, junto al estado. El mismo orden en los dos
                        anchos: el contacto (WhatsApp, medios de pago) antes que
                        la lista de barrios, que puede ser larga (ADR 0038).
                    -->
                    <template v-if="desktop">
                        <RestaurantContact id="ficha-contacto" tabindex="-1" class="mt-6 border-t border-line pt-4" :restaurant="restaurant" />
                        <RestaurantDelivery
                            v-if="restaurant.delivery.available"
                            id="ficha-domicilios"
                            tabindex="-1"
                            class="mt-6 border-t border-line pt-4"
                            :delivery="restaurant.delivery"
                        />
                    </template>
                </div>

                <div class="ficha-main">
                    <!--
                        Navegación interna del celular (#82): enlaces a las
                        secciones de abajo, con el teclado como cualquier enlace.
                        Las secciones llevan tabindex="-1": el foco va de verdad
                        a la sección (el lector la lee y Tab sigue desde ahí).
                    -->
                    <nav v-if="!desktop && sections.length > 1" class="mt-6" :aria-label="t('restaurant.sections')" data-sections>
                        <ul class="flex flex-wrap gap-2">
                            <li v-for="section in sections" :key="section.id">
                                <a :href="`#${section.id}`" class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold hover:bg-surface">
                                    {{ section.label }}
                                </a>
                            </li>
                        </ul>
                    </nav>

                    <!-- La de una ficha de ejemplo es el aviso de que no es real: va al pie, con los demás avisos. -->
                    <p v-if="restaurant.description && !restaurant.fictitious" class="mt-6 max-w-prose whitespace-pre-line" data-description>{{ restaurant.description }}</p>

                    <RestaurantPromotions
                        v-if="restaurant.promotions?.length"
                        id="ficha-promociones"
                        tabindex="-1"
                        class="ficha-section mt-8 border-t border-line pt-6"
                        :promotions="restaurant.promotions"
                    />

                    <RestaurantMenu id="ficha-menu" tabindex="-1" class="ficha-section mt-8 border-t border-line pt-6" :sections="restaurant.menu" :slug="restaurant.slug" />

                    <template v-if="!desktop">
                        <RestaurantContact id="ficha-contacto" tabindex="-1" class="ficha-section mt-8 border-t border-line pt-6" :restaurant="restaurant" />
                        <RestaurantDelivery
                            v-if="restaurant.delivery.available"
                            id="ficha-domicilios"
                            tabindex="-1"
                            class="ficha-section mt-8 border-t border-line pt-6"
                            :delivery="restaurant.delivery"
                        />
                    </template>
                </div>
            </div>

            <!-- El pie de la ficha (#125): de dónde salen los datos y qué hacer si no son correctos. -->
            <footer class="mt-8 border-t border-line pt-4 text-sm text-ink-muted" data-ficha-footer>
                <p v-if="restaurant.description && restaurant.fictitious" class="max-w-prose whitespace-pre-line" data-description>{{ restaurant.description }}</p>

                <!-- Reclamada: el último cambio que hizo el restaurante desde su panel. -->
                <p v-if="!restaurant.unverified && restaurant.owner_updated_on" class="mt-1" data-owner-updated>
                    {{ t('restaurant.owner_updated', { date: formatDate(restaurant.owner_updated_on, locale) }) }}
                </p>

                <!-- Sin reclamar: nadie del restaurante confirmó estos datos. -->
                <p v-if="restaurant.unverified" class="mt-1 flex items-start gap-2" data-unverified>
                    <Icon name="informacion" :size="20" class="shrink-0" />
                    <span>
                        {{
                            restaurant.updated_on
                                ? t('restaurant.unverified_since', { date: formatDate(restaurant.updated_on, locale) })
                                : t('restaurant.unverified')
                        }}
                    </span>
                </p>

                <div class="flex flex-wrap gap-x-4">
                    <!-- «Reclámalo» (#20): lo decide el servidor con la regla del formulario. -->
                    <Link
                        v-if="restaurant.claimable"
                        :href="`${restaurantUrl(restaurant.slug)}/claim`"
                        class="ficha-claim inline-flex min-h-touch items-center font-semibold underline underline-offset-4"
                        data-claim
                    >
                        {{ t('claim.link') }}
                    </Link>
                    <!-- Retiro de ficha (#20): en toda ficha publicada; lo revisa administración. -->
                    <Link
                        v-if="!restaurant.hidden"
                        :href="`${restaurantUrl(restaurant.slug)}/removal`"
                        class="inline-flex min-h-touch items-center underline underline-offset-4"
                        data-removal
                    >
                        {{ t('removal.link') }}
                    </Link>
                </div>
            </footer>
        </article>

        <!-- El pedido (#15): la barra aparece con el primer plato y abre el carrito. -->
        <OrderBar :restaurant="restaurant" />
    </div>
</template>

<style scoped>
/*
 * El diseño de la ficha (ADR 0038). CSS propio de la ficha, no utilidades
 * nuevas de Tailwind: el CSS de Tailwind baja con el arranque (ADR 0020) y
 * este, con la ficha.
 *
 * Hasta 1024 px, una columna de hasta 48 rem, como antes; desde 64 rem (el
 * mismo corte del inicio, ADR 0037), dos columnas al ancho de la cabecera y el
 * pie del layout (max-w-6xl, 72 rem: el logo queda sobre el nombre): el menú a
 * la izquierda (45 rem como mucho, 720 px: las líneas de los platos no se
 * estiran de más) y lo de un vistazo en una de 22 rem a la derecha.
 */
.ficha {
    margin-inline: auto;
    width: 100%;
    max-width: 48rem;
}

/* Al saltar desde la navegación interna, el título de la sección no queda pegado al borde. */
.ficha-section {
    scroll-margin-top: 1rem;
}

/* «¿Es tu negocio?» se lee con el color del texto, no el apagado del pie: es una invitación. */
.ficha-claim {
    color: var(--color-ink);
}

.ficha-aside {
    margin-top: 0.75rem;
}

@media (min-width: 64rem) {
    .ficha {
        max-width: var(--container-6xl, 72rem);
        /*
         * La barra del pedido (OrderBar, fija abajo) va sobre la columna del
         * menú y no cruza la de la derecha: de los bordes de la ficha, menos
         * los 22 rem de la columna y los 3 del hueco (sus 1 rem de margen
         * dejan el botón justo sobre el menú). Así la columna no se acorta.
         */
        --ficha-edge: max(0px, (100% - var(--container-6xl, 72rem)) / 2);
        --order-bar-inset-inline: var(--ficha-edge) calc(var(--ficha-edge) + 25rem);
    }

    .ficha-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 22rem;
        /* La segunda fila es flexible: el alto de la columna de la derecha no abre un hueco bajo la cabecera. */
        grid-template-rows: auto 1fr;
        column-gap: 3rem;
    }

    .ficha-head {
        grid-column: 1;
        grid-row: 1;
    }

    .ficha-main {
        grid-column: 1;
        grid-row: 2;
    }

    /*
     * Fija al bajar, sin tapar nada: va en su propia columna, y la barra del
     * pedido, al lado. Si no cabe en la ventana (muchos barrios, una ventana
     * baja) se desplaza por dentro, así nada queda fuera de alcance. Con zoom
     * del 200 % la ventana mide menos de 1024 px CSS y la ficha vuelve a una
     * columna, sin nada fijo (WCAG 1.4.10).
     */
    .ficha-aside {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: start;
        position: sticky;
        top: 1rem;
        max-height: calc(100dvh - 2rem);
        overflow-y: auto;
        margin-top: 1rem;
        padding: 1.25rem;
        border: 1px solid var(--color-line);
        border-radius: var(--veni-radius-md);
    }
}
</style>

