<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from 'vue';

import DishPhoto from '@/components/DishPhoto.vue';
import DishPhotoViewer from '@/components/DishPhotoViewer.vue';
import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useModalDialog } from '@/composables/useModalDialog';
import { formatPesos } from '@/i18n/intl';
import { ingredientEffects, isOptionSubstituted } from '@/order/ingredients';
import type { GroupProblem, OrderItem, UnavailableReason } from '@/order/selection';
import {
    acceptsSubstitute,
    clampQuantity,
    emptySelection,
    isOptionChosen,
    isOptionLocked,
    isSingleChoice,
    linePrice,
    MAX_QUANTITY,
    MIN_QUANTITY,
    NOTE_MAX_LENGTH,
    selectionProblems,
    setSubstitute,
    toggleOption,
    toOrderItem,
} from '@/order/selection';
import type { MenuDish, MenuOptionGroup } from '@/restaurants/profile';

/**
 * El selector de un plato (#14, ADR 0023): opciones obligatorias, adiciones
 * con su recargo, ingredientes para quitar, una nota, la cantidad y el precio
 * de la línea, recalculado con cada toque. «Agregar» emite el ítem listo para
 * el pedido; si falta algo, lo dice en cada grupo, lo anuncia y lleva el foco
 * al primero que falta.
 *
 * Es un <dialog> nativo abierto con showModal() (useModalDialog): el
 * navegador encierra el foco, deja el resto de la página inerte y cierra con
 * Escape; si lo cierra por su cuenta, también avisa (EVA-047). En un celular
 * vertical es una hoja que sube de abajo (#141, M9): se cierra con «Cerrar»,
 * con Escape, con un toque en el fondo y deslizándola hacia abajo desde su
 * manija (Pointer Events, como el panel del mapa, ADR 0022: lejos o rápido
 * cierra; si no, vuelve a su lugar). Desde 768 px queda centrado y sin
 * manija. Lo carga RestaurantMenu recién cuando se toca un plato: no pesa en
 * la ficha ni en el arranque.
 *
 * `unavailable` lo calcula el menú, con su reloj (unavailableReason): si el
 * plato se agota, se queda sin un ingrediente esencial o sin opciones con el
 * selector abierto, «Agregar» ya no lo deja en el pedido y anuncia por qué.
 *
 * `today` (el día de Colombia del menú) trae los ingredientes agotados hoy
 * (ADR 0033): una adición agotada no se puede marcar, un «Quitar» de algo
 * que no hay queda marcado y fijo, y por cada reemplazo la persona elige
 * entre aceptarlo (suma su recargo) o pedir sin nada; el de un esencial va
 * sí o sí. El «Quitar» de un ingrediente con reemplazo no sale: lo decide el
 * reemplazo.
 *
 * Arriba, la foto del plato a todo lo ancho de la hoja (#126, #141): al
 * desplazar lo de abajo se encoge (donde el navegador anima con el
 * desplazamiento; en los demás, simplemente sube con el contenido). Al
 * tocarla se amplía a pantalla completa (DishPhotoViewer, otro diálogo encima
 * de este) y al cerrar el foco vuelve a ella. Sin foto, el ícono del plato más
 * chico y sin ampliar. «Agregar · $X» queda fijo abajo.
 */
const {
    dish,
    unavailable = null,
    today: day = null,
} = defineProps<{ dish: MenuDish; unavailable?: UnavailableReason | null; today?: string | null }>();
/** El día del menú; sin día (null), el plato se arma sin mirar ingredientes. Función: sigue al prop. */
function currentDay(): string | undefined {
    return day ?? undefined;
}

const emit = defineEmits<{ add: [item: OrderItem]; close: [] }>();

const { t, locale } = useI18n();
const id = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const title = useTemplateRef<HTMLElement>('title');
const zoomButton = useTemplateRef<HTMLButtonElement>('zoom');
/** La foto a pantalla completa, abierta o no. */
const zoomed = ref(false);

const selection = ref(emptySelection(dish));
/** Los errores se muestran después del primer intento de agregar, no antes. */
const attempted = ref(false);
const announcement = ref('');
/** Si el último toque empezó en el fondo: arrastrar desde la hoja y soltar afuera no cierra. */
let pressedOnBackdrop = false;

/** Cuánto bajó la hoja mientras se desliza (px); null fuera del deslizamiento. */
const dragY = ref<number | null>(null);
/** Lo que baja para cerrar, o la velocidad (px/ms) con la que se suelta, con un mínimo de recorrido. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.6;
const CLOSE_MIN_FLICK = 24;
let grab: { pointer: number; startY: number; lastY: number; lastTime: number; velocity: number } | null = null;

const problems = computed(() => selectionProblems(dish, selection.value, currentDay()));
const total = computed(() => linePrice(dish, selection.value, currentDay()));
/** Lo que hoy no hay y no tiene reemplazo: «Hoy sin X». */
const withoutToday = computed(() => ingredientEffects(dish, currentDay()).flatMap((effect) => (effect.kind === 'without' ? [effect.name] : [])));
/** Los reemplazos que hoy se ofrecen, cada uno con su elección. */
const substitutes = computed(() => ingredientEffects(dish, currentDay()).flatMap((effect) => (effect.kind === 'substitute' ? [effect] : [])));

function hint(group: MenuOptionGroup): string {
    if (group.kind === 'removal') {
        return t('order.picker.remove_hint');
    }

    if (group.min === 0) {
        return `${t('order.picker.optional')} · ${t('order.picker.up_to', { max: group.max })}`;
    }

    const choose =
        group.min === group.max
            ? group.min === 1
                ? t('order.picker.choose_one')
                : t('order.picker.choose_exactly', { count: group.min })
            : t('order.picker.choose_between', { min: group.min, max: group.max });

    return `${t('order.picker.required')} · ${choose}`;
}

function problemText(problem: GroupProblem | null | undefined): string {
    switch (problem?.kind) {
        case undefined:
            return '';
        case 'missing':
            return problem.min === 1 ? t('order.picker.error_missing_one') : t('order.picker.error_missing_many', { min: problem.min });
        case 'too_many':
            return t('order.picker.error_too_many', { max: problem.max });
        case 'unavailable':
            return t('order.picker.error_unavailable');
    }
}

function isChosen(groupIndex: number, optionIndex: number): boolean {
    return isOptionChosen(dish, selection.value, groupIndex, optionIndex, currentDay());
}

/** Lo fija un ingrediente agotado hoy: la adición no se marca y el «Quitar» queda marcado. */
function isLocked(groupIndex: number, optionIndex: number): boolean {
    return isOptionLocked(dish, groupIndex, optionIndex, currentDay());
}

/** Con el grupo lleno, las demás casillas no se pueden marcar; tampoco las fijas por un ingrediente agotado. */
function isBlocked(group: MenuOptionGroup, groupIndex: number, optionIndex: number): boolean {
    if (isLocked(groupIndex, optionIndex)) {
        return true;
    }

    return !isSingleChoice(group) && !isChosen(groupIndex, optionIndex) && (selection.value.chosen[groupIndex]?.length ?? 0) >= group.max;
}

function chooseSubstitute(index: number, accept: boolean): void {
    selection.value = setSubstitute(selection.value, index, accept);
}

function toggle(group: MenuOptionGroup, groupIndex: number, optionIndex: number): void {
    selection.value = toggleOption(selection.value, group, groupIndex, optionIndex);
}

function step(delta: number): void {
    selection.value = { ...selection.value, quantity: clampQuantity(selection.value.quantity + delta) };
}

// Sin v-model: su directiva sumaría código de Vue al arranque, que comparte
// el chunk de Vue con todas las páginas (resources/js/map/bundle.test.ts).
function onNote(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
        selection.value = { ...selection.value, note: event.target.value };
    }
}

/** Un «Quitar» de algo que hoy va con reemplazo: no se muestra (lo decide el reemplazo). */
function isSubstituted(groupIndex: number, optionIndex: number): boolean {
    return isOptionSubstituted(dish, groupIndex, optionIndex, currentDay());
}

/** Lo que se anuncia si el plato ya no se puede agregar. */
function unavailableText(reason: UnavailableReason): string {
    switch (reason.reason) {
        case 'sold_out':
            return t('order.picker.sold_out');
        case 'ingredient':
            return t('order.picker.unavailable_ingredient', { name: reason.name });
        case 'options':
            return t('order.picker.unavailable');
    }
}

function optionLabel(group: MenuOptionGroup, name: string): string {
    return group.kind === 'removal' ? t('order.picker.remove_option', { name }) : name;
}

/** El reemplazo de un ingrediente, con su recargo si suma. */
function substituteLabel(effect: { name: string; substitute: string; price: number }): string {
    const label = t('order.picker.swap_accept', { substitute: effect.substitute, name: effect.name });

    return effect.price > 0 ? `${label} · ${t('order.picker.extra_price', { price: formatPesos(effect.price, locale.value) })}` : label;
}

/** Vaciar y volver a escribir: así la región viva lo anuncia cada vez. */
async function announce(text: string): Promise<void> {
    announcement.value = '';
    await nextTick();
    announcement.value = text;
}

// Sin el modificador .prevent: su código sumaría al chunk de Vue, el del arranque.
async function submit(event: Event): Promise<void> {
    event.preventDefault();

    if (unavailable !== null) {
        await announce(unavailableText(unavailable));

        return;
    }

    const item = toOrderItem(dish, selection.value, currentDay());

    if (item !== null) {
        emit('add', item);

        return;
    }

    attempted.value = true;
    await announce(t('order.picker.errors'));

    const first = problems.value.findIndex((problem) => problem !== null);
    dialog.value?.querySelector<HTMLInputElement>(`[data-group="${String(first)}"] input:not(:disabled)`)?.focus();
}

/** Idempotente: «Cerrar» y el close nativo del visor pueden llegar los dos (EVA-047). */
async function closeZoom(): Promise<void> {
    if (!zoomed.value) {
        return;
    }

    zoomed.value = false;
    await nextTick();
    zoomButton.value?.focus();
}

function onPointerDown(event: PointerEvent): void {
    pressedOnBackdrop = event.target === dialog.value;
}

function onGrabDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) {
        return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    grab = { pointer: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0 };
    dragY.value = 0;
}

function onGrabMove(event: PointerEvent): void {
    if (grab === null || event.pointerId !== grab.pointer) {
        return;
    }

    const elapsed = event.timeStamp - grab.lastTime;

    if (elapsed > 0) {
        // Hacia abajo es positiva.
        grab.velocity = (event.clientY - grab.lastY) / elapsed;
    }

    grab.lastY = event.clientY;
    grab.lastTime = event.timeStamp;
    // Hacia arriba no sube: la hoja ya está a su altura.
    dragY.value = Math.max(0, event.clientY - grab.startY);
}

/** Soltar: lejos, o rápido hacia abajo, cierra; si no, vuelve a su lugar. */
function onGrabEnd(event: PointerEvent): void {
    if (grab === null || event.pointerId !== grab.pointer) {
        return;
    }

    const { velocity, lastTime } = grab;
    const distance = dragY.value ?? 0;
    grab = null;
    dragY.value = null;

    // Quieto un rato antes de soltar: ya no es un gesto rápido.
    const flick = event.timeStamp - lastTime > 100 ? 0 : velocity;

    if (event.type === 'pointerup' && (distance > CLOSE_DISTANCE || (flick > CLOSE_VELOCITY && distance > CLOSE_MIN_FLICK))) {
        emit('close');
    }
}

/**
 * Un toque en el fondo (fuera de la hoja) cierra, como Escape. Solo si
 * también empezó ahí: al seleccionar texto de la nota y soltar afuera, el
 * click cae en el <dialog> pero no es un toque en el fondo.
 */
function onClick(event: MouseEvent): void {
    const fromBackdrop = pressedOnBackdrop;
    pressedOnBackdrop = false;

    if (fromBackdrop && event.target === dialog.value) {
        emit('close');
    }
}

useModalDialog(dialog, {
    onDismiss: () => {
        emit('close');
    },
});

onMounted(() => {
    // El foco en el título: el lector de pantalla dice qué plato se abrió.
    title.value?.focus();
});
</script>

<template>
    <dialog
        ref="dialog"
        class="dish-picker text-ink"
        :aria-labelledby="`${id}-title`"
        :style="dragY === null ? undefined : { translate: `0 ${String(dragY)}px` }"
        :data-dragging="dragY === null ? undefined : ''"
        data-dish-picker
        @pointerdown="onPointerDown"
        @click="onClick"
    >
        <form class="flex min-h-0 flex-1 flex-col" novalidate @submit="submit">
            <!--
                La manija de la hoja (#141, M9): solo con el dedo o el mouse, y
                solo en el celular. Con el teclado y el lector se cierra con
                «Cerrar» o Escape: por eso no es un control.
            -->
            <div
                class="dish-picker-grab"
                aria-hidden="true"
                data-grab
                @pointerdown="onGrabDown"
                @pointermove="onGrabMove"
                @pointerup="onGrabEnd"
                @pointercancel="onGrabEnd"
                @lostpointercapture="onGrabEnd"
            >
                <span class="dish-picker-grab-bar rounded-full" />
            </div>
            <!-- Antes que lo demás en el documento (el teclado lo alcanza enseguida) y encima de la foto, sólido. -->
            <button
                type="button"
                class="dish-picker-close inline-flex size-touch items-center justify-center rounded-full"
                :aria-label="t('order.picker.close')"
                data-close
                @click="emit('close')"
            >
                <Icon name="cerrar" :size="20" />
            </button>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" :class="{ 'pt-12': !dish.photo }">
                <!--
                    La foto grande va dentro de lo que se desplaza y con un alto tope: en un celular bajo no tapa
                    las opciones ni alarga el diálogo (#113, #126). Tocarla la amplía. Sin foto, el ícono del plato
                    en su lugar, del tamaño de la miniatura: no empuja las opciones y no se amplía.
                -->
                <button
                    v-if="dish.photo"
                    ref="zoom"
                    type="button"
                    class="dish-picker-zoom"
                    :aria-label="t('order.picker.photo_zoom', { name: dish.name })"
                    data-zoom
                    @click="zoomed = true"
                >
                    <DishPhoto :image="dish.photo" :name="dish.name_es ?? dish.name" :alt="dish.name" size="large" />
                </button>
                <DishPhoto v-else class="dish-picker-icon" :image="null" :name="dish.name_es ?? dish.name" alt="" size="thumb" />

                <header class="mt-4">
                    <h2 :id="`${id}-title`" ref="title" tabindex="-1" class="text-xl wrap-anywhere">{{ dish.name }}</h2>
                    <p v-if="dish.description" class="mt-1 text-sm wrap-anywhere text-ink-muted">{{ dish.description }}</p>
                    <p class="mt-1 font-semibold tabular-nums">{{ formatPesos(dish.price, locale) }}</p>
                    <p v-for="name in withoutToday" :key="name" class="mt-1 text-sm font-semibold wrap-anywhere" data-ingredient-note>
                        {{ t('restaurant.menu.today_without', { name }) }}
                    </p>
                </header>

                <fieldset v-for="effect in substitutes" :key="`swap-${effect.index}`" class="mt-4" :aria-describedby="`${id}-swap-hint-${effect.index}`" data-substitute>
                    <legend class="font-semibold">{{ t('order.picker.swap_legend', { name: effect.name }) }}</legend>
                    <p :id="`${id}-swap-hint-${effect.index}`" class="text-sm text-ink-muted">
                        {{ effect.required ? t('order.picker.swap_required_hint') : t('order.picker.swap_hint') }}
                    </p>
                    <ul class="mt-1 divide-y divide-line">
                        <li v-for="accept in effect.required ? [true] : [true, false]" :key="String(accept)">
                            <label class="flex min-h-touch cursor-pointer items-center gap-3 py-1">
                                <input
                                    type="radio"
                                    :name="`${id}-swap-${effect.index}`"
                                    class="dish-picker-check size-5 shrink-0"
                                    :checked="(effect.required || acceptsSubstitute(selection, effect.index)) === accept"
                                    :data-swap="accept ? 'accept' : 'decline'"
                                    @change="chooseSubstitute(effect.index, accept)"
                                >
                                <span class="min-w-0 flex-1 wrap-anywhere">{{ accept ? substituteLabel(effect) : t('order.picker.swap_decline', { name: effect.name }) }}</span>
                            </label>
                        </li>
                    </ul>
                </fieldset>

                <fieldset
                    v-for="(group, groupIndex) in dish.groups"
                    :key="groupIndex"
                    class="mt-4"
                    :data-group="groupIndex"
                    :aria-describedby="`${id}-hint-${groupIndex}${attempted && problems[groupIndex] ? ` ${id}-error-${groupIndex}` : ''}`"
                >
                    <legend class="font-semibold">{{ group.name }}</legend>
                    <p :id="`${id}-hint-${groupIndex}`" class="text-sm text-ink-muted">{{ hint(group) }}</p>
                    <p v-if="attempted && problems[groupIndex]" :id="`${id}-error-${groupIndex}`" class="mt-1 text-sm font-semibold" data-error>
                        {{ problemText(problems[groupIndex]) }}
                    </p>

                    <ul class="mt-1 divide-y divide-line">
                        <template v-for="(option, optionIndex) in group.options" :key="optionIndex">
                            <li v-if="!isSubstituted(groupIndex, optionIndex)">
                                <label class="flex min-h-touch cursor-pointer items-center gap-3 py-1" :class="{ 'dish-picker-blocked': isBlocked(group, groupIndex, optionIndex) }">
                                    <input
                                        :type="isSingleChoice(group) ? 'radio' : 'checkbox'"
                                        :name="`${id}-group-${groupIndex}`"
                                        class="dish-picker-check size-5 shrink-0"
                                        :checked="isChosen(groupIndex, optionIndex)"
                                        :disabled="isBlocked(group, groupIndex, optionIndex)"
                                        data-option
                                        @change="toggle(group, groupIndex, optionIndex)"
                                    >
                                    <span class="min-w-0 flex-1 wrap-anywhere">{{ optionLabel(group, option.name) }}</span>
                                    <span v-if="isLocked(groupIndex, optionIndex)" class="shrink-0 text-sm text-ink-muted" data-out-today>{{ t('order.picker.out_today') }}</span>
                                    <span v-else-if="group.kind === 'choice' && option.price > 0" class="shrink-0 text-sm tabular-nums text-ink-muted">
                                        {{ t('order.picker.extra_price', { price: formatPesos(option.price, locale) }) }}
                                    </span>
                                </label>
                            </li>
                        </template>
                    </ul>
                </fieldset>

                <div class="mt-4">
                    <label :for="`${id}-note`" class="font-semibold">{{ t('order.picker.note') }}</label>
                    <p :id="`${id}-note-hint`" class="text-sm text-ink-muted">{{ t('order.picker.note_hint') }}</p>
                    <textarea
                        :id="`${id}-note`"
                        :value="selection.note"
                        class="dish-picker-note mt-1 block w-full border border-line bg-canvas p-2"
                        rows="2"
                        :maxlength="NOTE_MAX_LENGTH"
                        :aria-describedby="`${id}-note-hint ${id}-note-count`"
                        data-note
                        @input="onNote"
                    />
                    <p :id="`${id}-note-count`" class="mt-1 text-right text-sm text-ink-muted tabular-nums">
                        {{ t('order.picker.note_count', { count: selection.note.length, max: NOTE_MAX_LENGTH }) }}
                    </p>
                </div>
            </div>

            <footer class="dish-picker-footer flex items-center gap-3 border-t border-line">
                <div class="flex items-center gap-1" role="group" :aria-label="t('order.picker.quantity')">
                    <button
                        type="button"
                        class="dish-picker-step inline-flex size-touch items-center justify-center rounded-full border border-line text-xl"
                        :aria-label="t('order.picker.decrease')"
                        :disabled="selection.quantity <= MIN_QUANTITY"
                        data-decrease
                        @click="step(-1)"
                    >
                        −
                    </button>
                    <output class="dish-picker-quantity text-center font-semibold tabular-nums" aria-live="polite" data-quantity>{{ selection.quantity }}</output>
                    <button
                        type="button"
                        class="dish-picker-step inline-flex size-touch items-center justify-center rounded-full border border-line text-xl"
                        :aria-label="t('order.picker.increase')"
                        :disabled="selection.quantity >= MAX_QUANTITY"
                        data-increase
                        @click="step(1)"
                    >
                        +
                    </button>
                </div>
                <button
                    type="submit"
                    class="inline-flex min-h-touch flex-1 items-center justify-center rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    data-add
                >
                    {{ t('order.picker.add', { price: formatPesos(total, locale) }) }}
                </button>
            </footer>

            <p role="alert" class="sr-only" data-announcement>{{ announcement }}</p>
        </form>
        <DishPhotoViewer v-if="zoomed && dish.photo" :image="dish.photo" :name="dish.name" @close="closeZoom" />
    </dialog>
</template>

<style scoped>
/*
 * Estilos propios del selector, aquí y no en utilidades nuevas de Tailwind:
 * el CSS de Tailwind es uno solo y baja con el arranque (ADR 0018); este va
 * en el chunk del selector, que se carga al tocar un plato.
 */
.dish-picker {
    margin: auto auto 0;
    width: 100%;
    max-width: 32rem;
    max-height: 90dvh;
    padding: 0;
    border: 0;
    border-radius: var(--veni-radius-lg) var(--veni-radius-lg) 0 0;
    background: var(--color-canvas);
}

.dish-picker[open] {
    display: flex;
    flex-direction: column;
}

.dish-picker::backdrop {
    background: rgb(0 0 0 / 0.5);
}

@media (min-width: 768px) {
    .dish-picker {
        margin: auto;
        border-radius: var(--veni-radius-lg);
    }
}

.dish-picker-footer {
    padding: 0.75rem 1rem;
}

/*
 * La foto (#141, M9): un botón de borde a borde de la hoja (con el margen del
 * contenido, -1 rem), 4:3 y con tope de alto para no tapar las opciones en un
 * celular bajo. Sube con el contenido.
 */
.dish-picker-zoom {
    display: block;
    width: calc(100% + 2rem);
    margin-inline: -1rem;
    padding: 0;
    border: 0;
    /* Sigue las esquinas de arriba de la hoja: la foto llega hasta ellas. */
    border-radius: var(--veni-radius-lg) var(--veni-radius-lg) 0 0;
    overflow: hidden;
    background: none;
    cursor: zoom-in;
}

.dish-picker-icon {
    margin-inline: auto;
}

/*
 * Donde el navegador anima con el desplazamiento, la foto se encoge y se
 * apaga un poco al subir el contenido. Sin esa función, o con «Reducir
 * movimiento», solo sube con él.
 */
@supports (animation-timeline: scroll()) {
    @media (prefers-reduced-motion: no-preference) {
        .dish-picker-zoom {
            transform-origin: center bottom;
            animation: dish-picker-photo linear both;
            animation-timeline: scroll(nearest block);
            animation-range: 0 12rem;
        }
    }
}

@keyframes dish-picker-photo {
    to {
        scale: 0.9;
        opacity: 0.35;
    }
}

/* «Cerrar»: un círculo sólido arriba a la derecha, encima de la foto; el borde lo separa de ella. */
.dish-picker-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 20;
    border: 1px solid var(--color-line);
    background: var(--color-canvas);
    color: var(--color-ink);
}

.dish-picker-close:hover {
    background: var(--color-surface);
}

/*
 * La manija para deslizar la hoja hacia abajo: solo en el celular. La barra
 * va con el color del texto a medias y un borde claro: se ve sobre la foto y
 * sobre el fondo.
 */
.dish-picker-grab {
    position: absolute;
    inset: 0 4rem auto 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    height: 2.75rem;
    padding-top: 0.5rem;
    cursor: grab;
    touch-action: none;
}

.dish-picker-grab-bar {
    width: 2.5rem;
    height: 0.25rem;
    background: color-mix(in srgb, var(--color-ink) 60%, var(--color-canvas));
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.7);
}

@media (min-width: 768px) {
    .dish-picker-grab {
        display: none;
    }
}

/* Al soltarla sin cerrar, vuelve a su lugar; mientras se desliza sigue al dedo, sin transición. */
@media (prefers-reduced-motion: no-preference) {
    .dish-picker:not([data-dragging]) {
        transition: translate 200ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }
}

.dish-picker-check {
    accent-color: var(--color-veni-ciruela);
}

[data-theme='dark'] .dish-picker-check {
    accent-color: var(--color-veni-mango);
}

/* Con el grupo lleno: se ve que no se puede marcar. */
.dish-picker-blocked {
    opacity: 0.6;
}

/*
 * Desactivado (#138, A4): con opacidad el «−» quedaba en 2,5:1 y el borde casi
 * no se veía. El signo y el borde van con el color del texto mezclado con el
 * fondo, a 3,8:1 en claro y 5,8:1 en oscuro (WCAG 1.4.11), y el borde
 * punteado dice que no se puede usar sin depender solo del color.
 */
.dish-picker-step:disabled {
    border-style: dashed;
    border-color: currentColor;
    color: color-mix(in srgb, var(--color-ink) 55%, var(--color-canvas));
    cursor: not-allowed;
}

.dish-picker-note {
    border-radius: var(--veni-radius-sm);
}

.dish-picker-quantity {
    width: 2rem;
}
/*
 * Entra en 320 ms (#138, ADR 0040): desde abajo en el celular y, centrado
 * en una pantalla ancha, un poco desde abajo y apareciendo. Con una curva
 * sin rebote: el resorte la subiría de más y dejaría ver una franja abajo.
 * Con «Reducir movimiento», sin animación.
 */
@media (prefers-reduced-motion: no-preference) {
    .dish-picker[open] {
        animation: dish-picker-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }

    .dish-picker[open]::backdrop {
        animation: dish-picker-fade 200ms ease-out;
    }
}

@keyframes dish-picker-in {
    from {
        translate: 0 100%;
    }
}

@keyframes dish-picker-fade {
    from {
        opacity: 0;
    }
}

@media (min-width: 768px) {
    @keyframes dish-picker-in {
        from {
            opacity: 0;
            translate: 0 2rem;
        }
    }
}
</style>
