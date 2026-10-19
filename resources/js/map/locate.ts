/**
 * «¿Dónde estoy?» (ADR 0008 y 0019): el control de geolocalización de
 * MapLibre, que el motor crea y suma al mapa como los botones de zoom. Aquí se
 * le pone el nombre en el idioma de la interfaz y el ícono de la app.
 *
 * No importa MapLibre: el control lo crea engine.ts, el único que lo importa.
 */

// El dibujo es un archivo del repositorio (colombia-icons, ADR 0011), no un
// dato: viaja dentro del chunk del mapa y está siempre que esté el botón.
import locateIcon from '../../icons/colombia/ubicacion.svg?raw';

export interface LocateButton {
    /** Cambia el nombre del botón (otro idioma), sin tocar su estado. */
    relabel(label: string): void;
    /** Deja de vigilar el botón: el mapa se libera. */
    dispose(): void;
}

/** El ícono, listo para el botón: hereda el color del texto (`currentColor`). */
function iconElement(): SVGSVGElement {
    const icon = new DOMParser().parseFromString(locateIcon, 'image/svg+xml').querySelector('svg');

    if (icon === null) {
        throw new Error('El ícono «ubicacion» no es un SVG.');
    }

    // El tamaño lo pone map.css.
    icon.removeAttribute('width');
    icon.removeAttribute('height');
    icon.setAttribute('class', 'veni-ctrl-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');

    return document.importNode(icon, true);
}

/**
 * Toma el botón del control, ya añadido al mapa en `container`.
 *
 * MapLibre pone el nombre del botón (en inglés) cuando termina de prepararlo,
 * un momento después de añadirlo, y lo vuelve a poner si cambia su estado:
 * un observador lo devuelve al de la app cada vez.
 */
export function takeLocateButton(container: HTMLElement, label: string): LocateButton {
    const button = container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate');

    if (button === null) {
        throw new Error('El control de geolocalización no está en el mapa.');
    }

    let current = label;

    const restore = (): void => {
        if (button.title !== current) {
            button.title = current;
        }

        if (button.getAttribute('aria-label') !== current) {
            button.setAttribute('aria-label', current);
        }
    };

    // El ícono de MapLibre es una imagen de su CSS; el de la app va en el DOM.
    button.replaceChildren(iconElement());
    restore();

    const observer = new MutationObserver(restore);
    observer.observe(button, { attributes: true, attributeFilter: ['title', 'aria-label'] });

    return {
        relabel(next) {
            current = next;
            restore();
        },
        dispose() {
            observer.disconnect();
        },
    };
}
