<script setup lang="ts">
import { router, usePage } from '@inertiajs/vue3';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { homeList, type HomeList, published, showHomeList } from '@/navigation/tabs';
import { cartRequest, forgetOrder, requestCart, useLatestOrder } from '@/order/useOrder';

/**
 * La barra de pestañas del celular (#139, ADR 0041): una píldora de vidrio
 * abajo con Mapa · Lista · Guía · Pedido, y aparte un botón redondo para
 * buscar. Solo por debajo de 1024 px: en computador la navegación va en la
 * cabecera (ADR 0037). Baja aparte del arranque, con los enlaces del layout
 * (components/links.ts); mientras tanto el lugar ya está reservado
 * (--veni-tabbar-space en app.css) y nada salta.
 *
 * Son enlaces reales: abren en otra pestaña con el clic del medio, y la
 * sección actual lleva `aria-current="page"`. En el inicio, «Mapa» y «Lista»
 * no recargan la página: piden lo que muestra el panel (`showHomeList`, en
 * navigation/tabs.ts, que el inicio vigila); el botón de buscar
 * abre la lista con el foco en el buscador.
 *
 * «Pedido» lleva el contador de platos del pedido que cambió último en este
 * teléfono y pide abrir su carrito (`requestCart`): en esa ficha, enseguida;
 * desde otra página, la ficha lo abre al llegar. Sin pedido no lleva a
 * ningún lado: no es un enlace, queda a la vista atenuada y el lector oye que
 * todavía no hay platos.
 *
 * En una página larga (la ficha, la guía) se esconde al bajar y vuelve al
 * subir o cuando algo de adentro recibe el foco; con «Reducir movimiento»
 * aparece y desaparece sin deslizarse. Fuera del mapa deja abajo un
 * espaciador de su alto, así lo último de la página no queda debajo.
 */
const { immersive } = defineProps<{ immersive?: boolean }>();

const { t } = useI18n();
const page = usePage();
const bar = useTemplateRef<HTMLElement>('bar');
// Con la lista publicada a la vista (la trajo el inicio), solo los pedidos de restaurantes que siguen en ella.
const order = useLatestOrder((slug) => published.value?.some((restaurant) => restaurant.slug === slug) ?? true);

const path = computed(() => new URL(page.url, window.location.href).pathname);
const onHome = computed(() => path.value === '/');

type Tab = 'map' | 'list' | 'dishes';

const current = computed<Tab | null>(() => {
    if (onHome.value) {
        return homeList.value === false ? 'map' : 'list';
    }

    return path.value === '/dishes' ? 'dishes' : null;
});

/*
| La ficha del pedido. Como restaurantUrl (restaurants/links.ts, una prueba lo
| compara), escrita aquí: importarla la sacaba del chunk del inicio a uno
| propio en el arranque, porque esta barra baja desde el layout (ADR 0041).
*/
const orderUrl = computed(() => (order.value === null ? null : `/restaurants/${encodeURIComponent(order.value.slug)}`));

/** Un clic que el navegador debe manejar solo (otra pestaña, otra ventana, descargar). */
function ownClick(event: MouseEvent): boolean {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Ir al inicio con la lista cerrada (`false`), abierta o abierta en el buscador. */
function home(event: MouseEvent, next: HomeList): void {
    if (!ownClick(event)) {
        return;
    }

    event.preventDefault();
    showHomeList(next);

    if (!onHome.value) {
        router.visit('/');
    }
}

function dishes(event: MouseEvent): void {
    if (ownClick(event)) {
        event.preventDefault();
        router.visit('/dishes');
    }
}

function openOrder(event: MouseEvent): void {
    if (!ownClick(event) || order.value === null || orderUrl.value === null) {
        return;
    }

    event.preventDefault();

    const { slug } = order.value;

    requestCart(slug);

    // En esa ficha, su barra del pedido lo toma enseguida; si no, al llegar.
    // Una visita que no llega a la ficha (falló, se cortó) no lo deja pedido,
    // y si la ficha ya no existe (404) su carrito se olvida; la página de
    // error sale igual (visitErrors.ts).
    if (path.value !== orderUrl.value) {
        router.visit(orderUrl.value, {
            onHttpException: (response) => {
                if (response.status === 404) {
                    forgetOrder(slug);
                }
            },
            onFinish: () => {
                if (cartRequest.value === slug) {
                    cartRequest.value = null;
                }
            },
        });
    }
}

/*
| Esconderse al bajar: cuenta desde el último cambio, con un margen de 8 px
| para que el temblor del dedo no la haga parpadear. Arriba del todo, o con el
| foco adentro, siempre se ve. Al cambiar de página Inertia desplaza solo (con
| atrás y adelante, a donde estaba): eso no es la persona bajando, y mientras
| se asienta (dos cuadros) no cuenta.
*/
const hidden = ref(false);
let lastY = 0;
let settling = false;

function onScroll(): void {
    if (settling) {
        return;
    }

    const y = window.scrollY;
    const delta = y - lastY;

    if (Math.abs(delta) < 8) {
        return;
    }

    lastY = y;
    hidden.value = delta > 0 && y > 64 && bar.value?.contains(document.activeElement) !== true;
}

// La barra fija abajo de la ficha (el pedido) baja al borde cuando esta se esconde.
watch(
    hidden,
    (value) => {
        document.documentElement.toggleAttribute('data-tabbar-hidden', value);
    },
    { immediate: true },
);

function settle(): void {
    settling = false;
    lastY = window.scrollY;
    hidden.value = false;
}

const stopShowingOnVisit = router.on('navigate', () => {
    settling = true;
    lastY = window.scrollY;
    hidden.value = false;
    requestAnimationFrame(() => requestAnimationFrame(settle));
});

onMounted(() => {
    lastY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
    stopShowingOnVisit();
    window.removeEventListener('scroll', onScroll);
    document.documentElement.removeAttribute('data-tabbar-hidden');
});
</script>

<template>
    <div v-if="!immersive" class="tabbar-spacer" aria-hidden="true" />
    <nav ref="bar" class="tabbar" :aria-label="t('tabs.label')" :data-hidden="hidden || undefined" data-tabbar @focusin="hidden = false">
        <ul class="tabbar-glass tabbar-tabs">
            <li>
                <a href="/" class="tabbar-tab" :aria-current="current === 'map' ? 'page' : undefined" data-tab="map" @click="home($event, false)">
                    <Icon name="mapa" :size="22" />
                    <span>{{ t('tabs.map') }}</span>
                </a>
            </li>
            <li>
                <a href="/" class="tabbar-tab" :aria-current="current === 'list' ? 'page' : undefined" data-tab="list" @click="home($event, 'heading')">
                    <Icon name="menu-hamburguesa" :size="22" />
                    <span>{{ t('tabs.list') }}</span>
                </a>
            </li>
            <li>
                <a href="/dishes" class="tabbar-tab" :aria-current="current === 'dishes' ? 'page' : undefined" data-tab="dishes" @click="dishes">
                    <Icon name="bandeja-paisa" :size="22" />
                    <span>{{ t('tabs.dishes') }}</span>
                </a>
            </li>
            <li>
                <!-- El nombre accesible empieza por lo que se ve («Pedido»), con cuántos platos lleva (WCAG 2.5.3). -->
                <a
                    v-if="order && orderUrl"
                    :href="orderUrl"
                    class="tabbar-tab"
                    :aria-label="t(order.count === 1 ? 'tabs.order_one' : 'tabs.order_many', { count: order.count })"
                    data-tab="order"
                    @click="openOrder"
                >
                    <span class="tabbar-icon">
                        <Icon name="carrito" :size="22" />
                        <span class="tabbar-badge" data-order-count>{{ order.count }}</span>
                    </span>
                    <span>{{ t('tabs.order') }}</span>
                </a>
                <!-- Sin pedido no es un control (aria-disabled no se anuncia en un <span>): el lector oye la frase entera. -->
                <span v-else class="tabbar-tab" data-tab="order" data-empty>
                    <Icon name="carrito" :size="22" />
                    <span aria-hidden="true" data-order-label>{{ t('tabs.order') }}</span>
                    <span class="sr-only">{{ t('tabs.order_empty') }}</span>
                </span>
            </li>
        </ul>
        <a href="/" class="tabbar-glass tabbar-search" :aria-label="t('tabs.search')" data-tab="search" @click="home($event, 'search')">
            <Icon name="buscar" :size="24" />
        </a>
    </nav>
</template>

<style scoped>
/*
 * La barra flota abajo, centrada, sobre el margen del sistema (la línea de
 * inicio del iPhone). Su alto lo reserva --veni-tabbar-space (app.css): el
 * panel del mapa y la barra del pedido van encima. Solo por debajo de
 * 1024 px.
 *
 * Vidrio (#139): el fondo es el del tema al 88 % con desenfoque. Medido con
 * el peor fondo posible detrás (negro puro en claro, blanco puro en oscuro),
 * el texto apagado queda en 5,0:1 en claro y el de oscuro en 10:1 (WCAG
 * 1.4.3). Sin desenfoque en el navegador, o con «Reducir transparencia», el
 * fondo es sólido. El nombre de la propiedad del desenfoque es también una
 * utilidad de Tailwind: app.css la excluye como palabra (`@source not inline`).
 */
.tabbar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 30;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    padding: 0 max(0.75rem, env(safe-area-inset-right)) calc(0.5rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
    pointer-events: none;
}

/*
 * Lo que la barra le pide a toda página, aquí y no en app.css, que viaja en
 * el arranque (ADR 0040 y 0041): lo que recibe el foco no queda debajo de la
 * barra (WCAG 2.4.11; la del pedido suma la suya, OrderBar.vue), y con
 * viewport-fit=cover el iPhone acostado deja la isla y las esquinas a los
 * lados: la cabecera y el pie (AppLayout.vue) llevan al menos su margen de
 * 16 px y el contenido de las páginas suma el del sistema. El mapa va de
 * borde a borde; sus botones y su panel se corren solos (map.css, Home.vue).
 * Acostado, un iPhone siempre está por debajo de 1024 px: con la barra.
 */
:global(html) {
    scroll-padding-bottom: var(--veni-tabbar-space);
}

:global(.veni-safe-x) {
    padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right));
}

:global(.veni-safe-inset) {
    padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}

/*
 * La lista del inicio a pantalla completa (#139, ADR 0041): el panel de
 * abajo (`data-sheet`, que en computador y sin mapa no lleva) que muestra la
 * lista o sus siluetas ocupa todo el mapa, de borde a borde y sin la manija,
 * como una pestaña de iOS, con lo de adentro debajo de la isla y de las
 * esquinas y arriba de la barra. El mapa sigue montado (no recarga sus
 * teselas) pero oculto: fuera de la vista, del foco y del lector. Entra sin
 * moverse; al elegir un restaurante baja a media altura con el resorte de
 * siempre, y el panel avisa cuando termina (la cámara espera eso). Aquí y no
 * en el inicio: viaja con la barra, no en el arranque.
 */
:global([data-sheet]:has(> [data-sheet-body] > :is([data-full-list], [data-list-loading]))) {
    inset: 0;
    z-index: 20;
    max-height: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) var(--veni-tabbar-space) env(safe-area-inset-left);
    border-width: 0;
    border-radius: 0;
    box-shadow: none;
    transition-property: none;
}

:global([data-sheet]:has(> [data-sheet-body] > :is([data-full-list], [data-list-loading])) > [data-sheet-handle]) {
    display: none;
}

/* Sin manija, lo de adentro no le deja lugar arriba: solo el margen del sistema y un respiro. */
:global([data-sheet]:has(> [data-sheet-body] > :is([data-full-list], [data-list-loading])) > [data-sheet-body]) {
    padding-top: 0.5rem;
}

:global([data-sheet]:has(> [data-sheet-body] > :is([data-full-list], [data-list-loading])) ~ *) {
    visibility: hidden;
}

/* El panel del inicio al costado (`side:`, app.css) empieza después de la isla. */
@media (width >= 48rem), (width >= 30rem) and (height < 32rem) {
    :global(.veni-safe-side) {
        left: max(1rem, env(safe-area-inset-left));
    }
}

.tabbar > * {
    pointer-events: auto;
}

.tabbar[data-hidden] {
    translate: 0 calc(100% + 1rem);
}

.tabbar-spacer {
    height: var(--veni-tabbar-space);
}

.tabbar-glass {
    border: 1px solid var(--color-line);
    background: var(--color-canvas);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.16);
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .tabbar-glass {
        background: color-mix(in srgb, var(--color-canvas) 88%, transparent);
        -webkit-backdrop-filter: blur(20px) saturate(1.6);
        backdrop-filter: blur(20px) saturate(1.6);
    }
}

@media (prefers-reduced-transparency: reduce) {
    .tabbar-glass {
        background: var(--color-canvas);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
    }
}

.tabbar-tabs {
    display: flex;
    flex: 1;
    max-width: 24rem;
    min-width: 0;
    padding: 0.25rem;
    border-radius: 9999px;
}

.tabbar-tabs > li {
    flex: 1;
    min-width: 0;
}

.tabbar-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    min-height: 3rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1rem;
    color: var(--color-ink-muted);
}

.tabbar-tab[aria-current='page'] {
    background: var(--color-surface);
    color: var(--color-ink);
}

/* Sin pedido: se lee igual (5:1 sobre el vidrio), pero con el ícono atenuado y sin respuesta al tocar. */
.tabbar-tab[data-empty] :deep(svg) {
    opacity: 0.5;
}

.tabbar-icon {
    position: relative;
    display: inline-flex;
}

.tabbar-badge {
    position: absolute;
    top: -0.375rem;
    right: -0.75rem;
    min-width: 1.25rem;
    padding-inline: 0.25rem;
    border-radius: 9999px;
    background: var(--veni-ciruela);
    color: var(--veni-blanco);
    font-size: 0.75rem;
    line-height: 1.25rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
}

[data-theme='dark'] .tabbar-badge {
    background: var(--veni-mango);
    color: var(--veni-ciruela);
}

.tabbar-search {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 9999px;
    color: var(--color-ink);
}

@media (prefers-reduced-motion: no-preference) {
    .tabbar {
        /* Las propiedades largas: el atajo es también una utilidad (app.css la excluye como palabra). */
        transition-property: translate;
        transition-duration: 320ms;
        transition-timing-function: var(--veni-ease-spring);
    }
}

@media (min-width: 64rem) {
    .tabbar,
    .tabbar-spacer {
        display: none;
    }
}
</style>
