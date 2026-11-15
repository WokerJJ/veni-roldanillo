/**
 * Las alturas del panel de abajo del celular (#81, ADR 0022): asomado, a media
 * altura y completo, de menor a mayor. Lo que no es del DOM vive aquí, para
 * probarlo sin montar nada.
 */
export const SNAPS = ['peek', 'half', 'full'] as const;

export type SheetSnap = (typeof SNAPS)[number];

/**
 * El alto asomado, en rem: la manija, el buscador y una fila de botones
 * («Sugerime algo», los almuerzos) en la bienvenida (#139), o el nombre en el
 * resumen. Antes, 7,5: el título y «Ver la lista».
 */
export const PEEK_REM = 8.5;

/**
 * La franja de arriba que el panel completo deja libre, en rem: la de los
 * botones del mapa (zoom y «¿Dónde estoy?», unos 9 rem con sus márgenes).
 */
export const CONTROLS_REM = 10;

/**
 * El alto de cada una, como lo entiende CSS (`--sheet-height`). Media altura es
 * la mitad del mapa; completo, todo el mapa menos la barra de pestañas (el
 * panel flota solo por debajo de 1024 px, donde la hay, #139; el crédito del
 * mapa va arriba), el aviso de versión nueva si se ve y la franja de los
 * botones del mapa. Es un alto máximo:
 * si lo de adentro es más corto (la ruta compacta), el panel se ajusta a él y
 * no tapa mapa de más.
 */
export const SNAP_HEIGHTS: Readonly<Record<SheetSnap, string>> = {
    peek: `${String(PEEK_REM)}rem`,
    half: '50%',
    full: `calc(100% - var(--veni-tabbar-space) - var(--veni-update-prompt-space, 0px) - ${String(CONTROLS_REM)}rem)`,
};

/** Menos que esto (px) entre apoyar y soltar es un toque, no un arrastre. */
export const DRAG_SLOP = 6;

/**
 * Un arrastre vertical en curso, con Pointer Events: lo comparten el panel
 * del mapa (BottomSheet) y la hoja del plato (DishPicker, ADR 0042). Cada uno
 * decide qué hace con lo que se movió; aquí va lo común: qué puntero es, la
 * captura, cuánto bajó y a qué velocidad.
 */
export interface SheetDrag {
    pointer: number;
    startY: number;
    lastY: number;
    lastTime: number;
    /** px/ms del último tramo; positiva hacia abajo. */
    velocity: number;
    /** Ya pasó del margen de un toque. */
    moved: boolean;
}

/** Empieza un arrastre con el puntero primario (el dedo, o el botón principal del mouse) y lo captura; con otro, null. */
export function beginDrag(event: PointerEvent): SheetDrag | null {
    if (!event.isPrimary || event.button !== 0) {
        return null;
    }

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    return { pointer: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false };
}

/**
 * Sigue el arrastre: devuelve cuánto bajó desde donde empezó (px; negativo si
 * subió), o null si el evento es de otro puntero o todavía no pasó de `slop`
 * (un toque que tiembla no es un arrastre).
 */
export function trackDrag(drag: SheetDrag | null, event: PointerEvent, slop = 0): number | null {
    if (drag === null || event.pointerId !== drag.pointer) {
        return null;
    }

    if (!drag.moved && Math.abs(event.clientY - drag.startY) < slop) {
        return null;
    }

    const elapsed = event.timeStamp - drag.lastTime;

    if (elapsed > 0) {
        drag.velocity = (event.clientY - drag.lastY) / elapsed;
    }

    drag.moved = true;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    return event.clientY - drag.startY;
}

/** La velocidad con la que se suelta (px/ms, positiva hacia abajo): 0 si estuvo quieto un rato antes, que ya no es un gesto rápido. */
export function releaseSpeed(drag: SheetDrag, event: PointerEvent): number {
    return event.timeStamp - drag.lastTime > 100 ? 0 : drag.velocity;
}

/** Más rápido que esto (px/ms), soltar lleva a la altura siguiente en esa dirección, aunque no se haya llegado a la mitad. */
const FLICK_SPEED = 0.5;

/** La altura siguiente (`step` 1) o la anterior (−1), sin pasarse de los extremos. */
export function stepSnap(snap: SheetSnap, step: 1 | -1): SheetSnap {
    return SNAPS[Math.min(SNAPS.length - 1, Math.max(0, SNAPS.indexOf(snap) + step))] ?? snap;
}

/**
 * En qué altura queda el panel al soltarlo: con `height` px y moviéndose a
 * `velocity` px/ms (positiva si crece). Un gesto rápido sigue en su dirección;
 * uno lento queda en la más cercana.
 */
export function settle(height: number, velocity: number, heights: Readonly<Record<SheetSnap, number>>): SheetSnap {
    if (Math.abs(velocity) >= FLICK_SPEED) {
        const growing = velocity > 0;
        const ahead = SNAPS.filter((snap) => (growing ? heights[snap] > height : heights[snap] < height));
        const next = growing ? ahead.at(0) : ahead.at(-1);

        if (next !== undefined) {
            return next;
        }
    }

    return SNAPS.reduce((best, snap) => (Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best));
}
