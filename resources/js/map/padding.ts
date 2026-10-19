/**
 * Cuánto del mapa tapa algo que la página le pone encima (su panel), como el
 * margen que MapLibre deja libre al encuadrar: la cámara de «¿Dónde estoy?»
 * pone la ubicación en el centro de lo que queda a la vista.
 */

/** Píxeles por lado. */
export interface MapPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/** Un rectángulo en la pantalla, como el de `getBoundingClientRect()`. */
export type ScreenBox = Pick<DOMRectReadOnly, 'top' | 'right' | 'bottom' | 'left'>;

export const NO_PADDING: Readonly<MapPadding> = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Lo mínimo que queda libre, de alto y de ancho: dos áreas táctiles. Con un
 * panel que tapa casi todo (la lista abierta en un celular acostado), MapLibre
 * encuadraría en una franja de pocos píxeles, alejando el mapa de más, o no
 * podría encuadrar.
 */
const MIN_FREE = 88;

/**
 * El margen que deja `overlay` fuera de `map`: de un solo lado, el que más
 * mapa deja a la vista (un panel abajo en el celular, uno a la izquierda en
 * la computadora). Sin superposición, ninguno.
 */
export function paddingAround(map: ScreenBox, overlay: ScreenBox): MapPadding {
    const width = map.right - map.left;
    const height = map.bottom - map.top;
    const overlaps = overlay.left < map.right && overlay.right > map.left && overlay.top < map.bottom && overlay.bottom > map.top;

    if (!overlaps || width <= MIN_FREE || height <= MIN_FREE) {
        return { ...NO_PADDING };
    }

    // Lo que habría que dejar de cada lado para que el panel quede afuera, y
    // qué parte del mapa seguiría a la vista.
    const sides = [
        { side: 'top', covered: overlay.bottom - map.top, size: height },
        { side: 'bottom', covered: map.bottom - overlay.top, size: height },
        { side: 'left', covered: overlay.right - map.left, size: width },
        { side: 'right', covered: map.right - overlay.left, size: width },
    ] as const;
    const best = sides.reduce((chosen, candidate) =>
        (candidate.size - candidate.covered) / candidate.size > (chosen.size - chosen.covered) / chosen.size ? candidate : chosen,
    );

    return { ...NO_PADDING, [best.side]: Math.ceil(Math.min(best.covered, best.size - MIN_FREE)) };
}
