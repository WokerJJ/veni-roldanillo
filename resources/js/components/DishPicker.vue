<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { formatPesos } from '@/i18n/intl';
import type { GroupProblem, OrderItem } from '@/order/selection';
import {
    clampQuantity,
    emptySelection,
    isSingleChoice,
    linePrice,
    MAX_QUANTITY,
    MIN_QUANTITY,
    NOTE_MAX_LENGTH,
    selectionProblems,
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
 * Es un <dialog> nativo abierto con showModal(): el navegador encierra el
 * foco, deja el resto de la página inerte y cierra con Escape. En un celular
 * vertical sale de abajo, como el panel del mapa (ADR 0022); desde 768 px
 * queda centrado. Lo carga RestaurantMenu recién cuando se toca un plato:
 * no pesa en la ficha ni en el arranque.
 */
const { dish } = defineProps<{ dish: MenuDish }>();

const emit = defineEmits<{ add: [item: OrderItem]; close: [] }>();

const { t, locale } = useI18n();
const id = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const title = useTemplateRef<HTMLElement>('title');

const selection = ref(emptySelection(dish));
/** Los errores se muestran después del primer intento de agregar, no antes. */
const attempted = ref(false);
const announcement = ref('');

const problems = computed(() => selectionProblems(dish, selection.value));
const total = computed(() => linePrice(dish, selection.value));

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
    return selection.value.chosen[groupIndex]?.includes(optionIndex) ?? false;
}

/** Con el grupo lleno, las demás casillas no se pueden marcar. */
function isBlocked(group: MenuOptionGroup, groupIndex: number, optionIndex: number): boolean {
    return !isSingleChoice(group) && !isChosen(groupIndex, optionIndex) && (selection.value.chosen[groupIndex]?.length ?? 0) >= group.max;
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

function optionLabel(group: MenuOptionGroup, name: string): string {
    return group.kind === 'removal' ? t('order.picker.remove_option', { name }) : name;
}

// Sin el modificador .prevent: su código sumaría al chunk de Vue, el del arranque.
async function submit(event: Event): Promise<void> {
    event.preventDefault();
    const item = toOrderItem(dish, selection.value);

    if (item !== null) {
        emit('add', item);

        return;
    }

    attempted.value = true;
    // Vaciar y volver a escribir: así la región viva lo anuncia cada vez.
    announcement.value = '';
    await nextTick();
    announcement.value = t('order.picker.errors');

    const first = problems.value.findIndex((problem) => problem !== null);
    dialog.value?.querySelector<HTMLInputElement>(`[data-group="${String(first)}"] input:not(:disabled)`)?.focus();
}

/** Un toque en el fondo (fuera de la hoja) cierra, como Escape. */
function onClick(event: MouseEvent): void {
    if (event.target === dialog.value) {
        emit('close');
    }
}

function onCancel(event: Event): void {
    event.preventDefault();
    emit('close');
}

onMounted(() => {
    const element = dialog.value;

    if (element === null) {
        return;
    }

    if (typeof element.showModal === 'function') {
        element.showModal();
    } else {
        element.setAttribute('open', '');
    }

    // El foco en el título: el lector de pantalla dice qué plato se abrió.
    title.value?.focus();
});

onBeforeUnmount(() => {
    if (dialog.value?.open === true && typeof dialog.value.close === 'function') {
        dialog.value.close();
    }
});
</script>

<template>
    <dialog ref="dialog" class="dish-picker text-ink" :aria-labelledby="`${id}-title`" data-dish-picker @cancel="onCancel" @click="onClick">
        <form class="flex min-h-0 flex-1 flex-col" novalidate @submit="submit">
            <header class="dish-picker-header flex items-start justify-between gap-3 border-b border-line">
                <div class="min-w-0">
                    <h2 :id="`${id}-title`" ref="title" tabindex="-1" class="text-xl wrap-anywhere">{{ dish.name }}</h2>
                    <p v-if="dish.description" class="mt-0.5 text-sm wrap-anywhere text-ink-muted">{{ dish.description }}</p>
                    <p class="mt-1 font-semibold tabular-nums">{{ formatPesos(dish.price, locale) }}</p>
                </div>
                <button
                    type="button"
                    class="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                    :aria-label="t('order.picker.close')"
                    data-close
                    @click="emit('close')"
                >
                    <Icon name="cerrar" :size="20" />
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
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
                        <li v-for="(option, optionIndex) in group.options" :key="optionIndex">
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
                                <span v-if="group.kind === 'choice' && option.price > 0" class="shrink-0 text-sm tabular-nums text-ink-muted">
                                    {{ t('order.picker.extra_price', { price: formatPesos(option.price, locale) }) }}
                                </span>
                            </label>
                        </li>
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
    border-radius: 1rem 1rem 0 0;
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
        border-radius: 1rem;
    }
}

.dish-picker-header {
    padding: 1rem 1rem 0.75rem;
}

.dish-picker-footer {
    padding: 0.75rem 1rem;
}

.dish-picker-check {
    accent-color: var(--color-veni-ciruela);
}

:global([data-theme='dark']) .dish-picker-check {
    accent-color: var(--color-veni-mango);
}

/* Con el grupo lleno: se ve que no se puede marcar. */
.dish-picker-blocked {
    opacity: 0.6;
}

.dish-picker-step:disabled {
    opacity: 0.4;
}

.dish-picker-note {
    border-radius: 0.5rem;
}

.dish-picker-quantity {
    width: 2rem;
}
</style>
