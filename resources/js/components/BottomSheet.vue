<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import type { SheetSnap } from '@/components/sheet';
import { CONTROLS_REM, DRAG_SLOP, PEEK_REM, settle, SNAP_HEIGHTS, stepSnap } from '@/components/sheet';
import { useI18n } from '@/composables/useI18n';

/**
 * El panel de la página encima del mapa (#81, ADR 0022). En un celular
 * vertical (la variante `sheet:` de app.css) es un panel de abajo con tres alturas, asomado, a media
 * altura y completo, que se cambian arrastrando la manija (Pointer Events),
 * tocándola, con las flechas del teclado sobre ella o desde la página
 * (`v-model:snap`). Al costado (`side:`: desde 768 px, o acostado) la manija no se ve y el alto lo ponen las
 * clases de quien lo usa: el panel lateral de siempre.
 *
 * Con `docked` (el mapa no cargó) no flota: no hay manija ni alturas.
 * Lo de adentro se desplaza dentro del panel; la manija, no.
 */
const props = defineProps<{ snap: SheetSnap; docked?: boolean }>();

const emit = defineEmits<{ 'update:snap': [snap: SheetSnap] }>();

const { t } = useI18n();
const root = useTemplateRef<HTMLElement>('root');

/** El alto mientras se arrastra (px); fuera del arrastre, el de la altura elegida. */
const dragHeight = ref<number | null>(null);
/** Lo que anuncia la región viva: solo lo que cambió quien usa la manija. */
const announcement = ref('');

const NAMES = { peek: 'sheet.peek', half: 'sheet.half', full: 'sheet.full' } as const;

const height = computed(() => (dragHeight.value === null ? SNAP_HEIGHTS[props.snap] : `${String(dragHeight.value)}px`));

function choose(next: SheetSnap): void {
    // Lo que no cambia no se anuncia.
    if (next === props.snap) {
        return;
    }

    emit('update:snap', next);
    announcement.value = t('sheet.announce', { height: t(NAMES[next]) });
}

/** Las tres alturas en px, medidas ahora (el mapa cambia de alto al girar el teléfono o con el aviso de versión nueva). */
function heights(): Record<SheetSnap, number> {
    const element = root.value;
    const parent = element?.offsetParent;

    if (!element || !(parent instanceof HTMLElement)) {
        return { peek: 0, half: 0, full: 0 };
    }

    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const free = element.getBoundingClientRect().bottom - parent.getBoundingClientRect().top - CONTROLS_REM * rem;

    return { peek: PEEK_REM * rem, half: parent.clientHeight / 2, full: free };
}

let drag: { pointer: number; startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null = null;
/**
 * Con el mouse, el arrastre termina con un clic sobre la manija: ese no cambia
 * de altura. Con el dedo ese clic no llega: el próximo toque lo olvida.
 */
let skipClick = false;

function onPointerDown(event: PointerEvent): void {
    skipClick = false;

    if (!event.isPrimary || event.button !== 0 || !root.value) {
        return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = {
        pointer: event.pointerId,
        startY: event.clientY,
        startHeight: root.value.getBoundingClientRect().height,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocity: 0,
        moved: false,
    };
}

function onPointerMove(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointer) {
        return;
    }

    if (!drag.moved && Math.abs(event.clientY - drag.startY) < DRAG_SLOP) {
        return;
    }

    const { peek, full } = heights();
    const elapsed = event.timeStamp - drag.lastTime;

    if (elapsed > 0) {
        // Hacia arriba crece: la velocidad es positiva.
        drag.velocity = (drag.lastY - event.clientY) / elapsed;
    }

    drag.moved = true;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    dragHeight.value = Math.min(full, Math.max(peek, drag.startHeight + drag.startY - event.clientY));
}

function onPointerEnd(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointer) {
        return;
    }

    const { moved, velocity, lastTime } = drag;
    drag = null;

    if (moved && dragHeight.value !== null) {
        skipClick = event.type === 'pointerup';
        // Quieto un rato antes de soltar: ya no es un gesto rápido.
        choose(settle(dragHeight.value, event.timeStamp - lastTime > 100 ? 0 : velocity, heights()));
    }

    dragHeight.value = null;
}

function onClick(event: MouseEvent): void {
    // Enter o Espacio (un clic sin puntero, `detail` 0) siempre cambia de altura.
    if (skipClick && event.detail !== 0) {
        skipClick = false;

        return;
    }

    skipClick = false;

    // Toque o Enter: sube un escalón; desde el completo, vuelve a asomado.
    choose(props.snap === 'full' ? 'peek' : stepSnap(props.snap, 1));
}

const KEYS: Readonly<Record<string, (current: SheetSnap) => SheetSnap>> = {
    ArrowUp: (current) => stepSnap(current, 1),
    ArrowDown: (current) => stepSnap(current, -1),
    Home: () => 'peek',
    End: () => 'full',
};

function onKeydown(event: KeyboardEvent): void {
    const next = KEYS[event.key];

    if (next) {
        // Sin esto, las flechas desplazarían lo de adentro.
        event.preventDefault();
        choose(next(props.snap));
    }
}

/*
| Cuándo terminó de moverse tras cambiar de altura: al acabar la transición
| de su alto máximo, o enseguida si no hay (prefers-reduced-motion, al
| costado o sin mapa). La página espera eso para medir cuánto tapa (ADR 0022).
*/
let moving: { promise: Promise<void>; finish: () => void } | null = null;

watch(
    () => props.snap,
    () => {
        moving?.finish();
        const element = root.value;

        if (!element || props.docked) {
            return;
        }

        // La única transición del panel es la de su alto (200 ms): «0s» si no hay.
        if (!(Number.parseFloat(getComputedStyle(element).transitionDuration) > 0)) {
            return;
        }

        let finish = (): void => undefined;
        const promise = new Promise<void>((resolve) => {
            const onEnd = (event: Event): void => {
                if (event.target === element && (event as TransitionEvent).propertyName === 'max-height') {
                    finish();
                }
            };
            // Por si la transición no avisa (se cortó, el alto no cambió de verdad, o se ocultó).
            const timer = setTimeout(() => {
                finish();
            }, 400);

            finish = () => {
                clearTimeout(timer);
                element.removeEventListener('transitionend', onEnd);
                moving = null;
                resolve();
            };
            element.addEventListener('transitionend', onEnd);
        });

        moving = { promise, finish };
    },
    { flush: 'post' },
);

onBeforeUnmount(() => {
    moving?.finish();
});

/** Se cumple cuando el panel tiene ya su alto nuevo. */
function settled(): Promise<void> {
    return moving?.promise ?? Promise.resolve();
}

defineExpose({ root, settled });
</script>

<template>
    <section
        ref="root"
        class="flex flex-col"
        :class="{ 'sheet:motion-safe:transition-[max-height] sheet:motion-safe:duration-200': !props.docked && dragHeight === null }"
        :style="props.docked ? undefined : { '--sheet-height': height }"
        :data-sheet="props.docked ? undefined : props.snap"
    >
        <button
            v-if="!props.docked"
            type="button"
            class="absolute top-0 left-1/2 z-10 flex h-11 w-24 -translate-x-1/2 cursor-grab touch-none justify-center rounded-full pt-2 side:hidden"
            :aria-label="t('sheet.handle')"
            data-sheet-handle
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerEnd"
            @pointercancel="onPointerEnd"
            @lostpointercapture="onPointerEnd"
            @click="onClick"
            @keydown="onKeydown"
        >
            <span class="h-1 w-10 rounded-full bg-ink-muted/60" />
        </button>
        <div data-sheet-body class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4 sheet:pb-2" :class="props.docked ? 'pt-4' : 'pt-4 sheet:pt-7'">
            <slot />
        </div>
        <!-- Después de lo de adentro: su estado se anuncia y se encuentra primero. -->
        <p v-if="!props.docked" role="status" class="sr-only">{{ announcement }}</p>
    </section>
</template>
