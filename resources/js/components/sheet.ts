/**
 * Las alturas del panel de abajo del celular (#81, ADR 0022): asomado, a media
 * altura y completo, de menor a mayor. Lo que no es del DOM vive aquí, para
 * probarlo sin montar nada.
 */
export const SNAPS = ['peek', 'half', 'full'] as const;

export type SheetSnap = (typeof SNAPS)[number];

/** El alto asomado, en rem: la manija y una línea (el nombre, o el título y «Ver la lista»). */
export const PEEK_REM = 7.5;

/**
 * El alto de cada una, como lo entiende CSS (`--sheet-height`). Media altura es
 * la mitad del mapa; completo, todo el mapa menos la franja de la atribución,
 * el aviso de versión nueva si se ve y un respiro arriba.
 */
export const SNAP_HEIGHTS: Readonly<Record<SheetSnap, string>> = {
    peek: `${String(PEEK_REM)}rem`,
    half: '50%',
    full: 'calc(100% - var(--veni-attribution-clearance) - var(--veni-update-prompt-space, 0px) - 0.5rem)',
};

/** Menos que esto (px) entre apoyar y soltar es un toque, no un arrastre. */
export const DRAG_SLOP = 6;

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
