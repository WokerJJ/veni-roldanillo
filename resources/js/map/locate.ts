/**
 * «¿Dónde estoy?» (ADR 0008 y 0019): el control de geolocalización de
 * MapLibre, que el motor crea y suma al mapa como los botones de zoom. Aquí se
 * le pone el nombre en el idioma de la interfaz y el ícono de la app, y se
 * avisa, junto al botón, por qué no se puede mostrar la ubicación.
 *
 * Los avisos son parte del control, como los botones que pinta MapLibre: DOM
 * dentro del mapa, con los textos que da la app y los estilos de map.css.
 * Viajan con el motor y no pesan en el arranque. Y la posición no sale de
 * aquí: MapLibre la usa para la marca y la cámara, y los avisos dicen qué
 * pasó, nunca dónde (ADR 0008).
 *
 * Solo importa tipos de MapLibre: el control lo crea engine.ts, el único que
 * lo importa.
 */
import type { GeolocateControl, GeolocateErrorEvent } from 'maplibre-gl';

// Los dibujos son archivos del repositorio (colombia-icons, ADR 0011), no
// datos: viajan dentro del chunk del mapa y están siempre que esté el botón.
import closeIcon from '../../icons/colombia/cerrar.svg?raw';
import locateIcon from '../../icons/colombia/ubicacion.svg?raw';

import { NO_PADDING, paddingAround } from './padding';

/** Por qué «¿Dónde estoy?» no puede mostrar la ubicación. */
export type LocateProblem =
    /** Sin permiso: se negó, se cerró la pregunta o el navegador la bloquea. */
    | 'denied'
    /** El dispositivo no da la posición o tarda más que el plazo; MapLibre sigue intentando. */
    | 'signal'
    /** La posición está fuera de la región del mapa (sus límites, `veni:bounds`). */
    | 'outside'
    /** El navegador no tiene geolocalización (o la página no es segura). */
    | 'unsupported';

/** Los textos de «¿Dónde estoy?», en el idioma de la interfaz. */
export interface LocateTexts {
    /** El nombre del botón. */
    button: string;
    /** Que la ubicación ya está en el mapa: lo anuncia el lector de pantalla. */
    found: string;
    /** El nombre del botón que cierra un aviso. */
    close: string;
    /** Cada aviso: qué pasó y qué se puede hacer. */
    problems: Readonly<Record<LocateProblem, string>>;
}

export interface LocateControl {
    /** Cambia los textos (otro idioma), sin tocar el estado. */
    relabel(texts: LocateTexts): void;
    /**
     * Lo que la página pone encima del mapa (su panel), o `null`: la cámara
     * deja la ubicación en el centro de lo que queda a la vista.
     */
    setOverlay(overlay: HTMLElement | null): void;
    /** Deja de vigilar el botón y quita los avisos: el mapa se libera. */
    dispose(): void;
}

/** `GeolocationPositionError.PERMISSION_DENIED`. */
const PERMISSION_DENIED = 1;

/** Un ícono para un botón: decorativo, del color del texto (`currentColor`) y del tamaño que diga map.css. */
function iconElement(svg: string): SVGSVGElement {
    const icon = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('svg');

    if (icon === null) {
        throw new Error('El ícono no es un SVG.');
    }

    icon.removeAttribute('width');
    icon.removeAttribute('height');
    icon.setAttribute('class', 'veni-ctrl-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');

    return document.importNode(icon, true);
}

/**
 * Toma el botón de `control`, ya añadido al mapa en `container`, y pone ahí
 * mismo los avisos.
 *
 * El botón queda siempre habilitado y con el nombre de la app. MapLibre lo
 * deshabilita si el navegador no tiene geolocalización y cuando el permiso
 * está negado (también si ya lo estaba al cargar), y un botón deshabilitado
 * no explica nada: así, tocarlo dice qué pasa y cómo arreglarlo. Además le
 * pone su nombre en inglés al terminar de prepararlo, un momento después de
 * añadirlo, y al cambiar de estado. Un observador deshace las dos cosas.
 */
export function takeLocateControl(control: GeolocateControl, container: HTMLElement, initial: LocateTexts): LocateControl {
    const button = container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate');
    const group = button?.parentElement;

    if (!button || !group) {
        throw new Error('El control de geolocalización no está en el mapa.');
    }

    let texts = initial;
    /** El aviso a la vista, si hay uno. */
    let problem: LocateProblem | null = null;
    /** La ubicación está en el mapa. */
    let located = false;
    /**
     * Los avisos ya mostrados desde el último toque o la última ubicación: con
     * la ubicación encendida, MapLibre repite el mismo error en cada lectura
     * que falla, y un aviso cerrado no vuelve a abrirse cada 10 segundos.
     */
    const shown = new Set<LocateProblem>();
    /** El panel de la página sobre el mapa. */
    let overlay: HTMLElement | null = null;
    const fitBoundsOptions = { ...control.options.fitBoundsOptions };

    // MapLibre encuadra la ubicación con `fitBoundsOptions`, que lee cada vez:
    // el margen del panel va ahí, medido cuando cambia de tamaño el panel o el
    // mapa, y otra vez en cada toque (el panel pudo moverse sin cambiar de tamaño).
    const measure = (): void => {
        const padding = overlay ? paddingAround(container.getBoundingClientRect(), overlay.getBoundingClientRect()) : NO_PADDING;
        control.options.fitBoundsOptions = { ...fitBoundsOptions, padding };
    };
    const resizes = new ResizeObserver(measure);

    // El aviso: junto al botón, sin tapar el mapa ni llevarse el foco. Entra
    // al documento al mostrarse (así lo anuncia el lector de pantalla) y sale
    // al cerrarse.
    const notice = document.createElement('div');
    notice.className = 'veni-locate-notice';
    notice.setAttribute('role', 'alert');
    const message = document.createElement('p');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'veni-locate-close';
    close.append(iconElement(closeIcon));
    notice.append(message, close);

    // Lo que anuncia el lector de pantalla cuando la ubicación llega: una
    // región viva tiene que estar en el documento antes de cambiar.
    const announcer = document.createElement('p');
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    container.append(announcer);

    const restoreButton = (): void => {
        if (button.disabled) {
            button.disabled = false;
        }

        if (button.title !== texts.button) {
            button.title = texts.button;
        }

        if (button.getAttribute('aria-label') !== texts.button) {
            button.setAttribute('aria-label', texts.button);
        }
    };

    const render = (): void => {
        restoreButton();
        close.setAttribute('aria-label', texts.close);
        announcer.textContent = located ? texts.found : '';

        if (problem === null) {
            notice.remove();
        } else {
            message.textContent = texts.problems[problem];

            if (!notice.isConnected) {
                container.append(notice);
            }
        }
    };

    /** Quita el aviso. Si el foco estaba en él, pasa al botón en vez de perderse. */
    const hide = (): void => {
        const focused = notice.contains(document.activeElement);
        problem = null;
        render();

        if (focused) {
            button.focus();
        }
    };

    const report = (reason: LocateProblem): void => {
        located = false;

        if (!shown.has(reason)) {
            shown.add(reason);
            problem = reason;
        }

        render();
    };

    /** Lo cierra quien lo leyó: el foco vuelve al botón del que salió. */
    const onClose = (): void => {
        problem = null;
        render();
        button.focus();
    };

    // Escape lo cierra y no le llega a la página, que con Escape cierra su panel.
    const onNoticeKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
    };

    // En captura, antes que el botón: cada toque es un intento nuevo y lo
    // anterior ya no vale. Sin geolocalización en el navegador, MapLibre
    // fallaría al pedirla: el toque no le llega y el aviso lo explica.
    const onClick = (event: MouseEvent): void => {
        measure();
        shown.clear();
        located = false;
        hide();

        if (!(navigator as Partial<Navigator>).geolocation) {
            event.stopPropagation();
            report('unsupported');
        }
    };

    const onFound = (): void => {
        shown.clear();
        located = true;
        hide();
    };

    const onOutside = (): void => {
        report('outside');
    };

    const onError = (event: GeolocateErrorEvent): void => {
        // Sin permiso, MapLibre acaba de deshabilitar el botón: vuelve ya, sin
        // esperar al observador, para que el foco no se pierda con él.
        restoreButton();
        report(event.code === PERMISSION_DENIED ? 'denied' : 'signal');
    };

    // El ícono de MapLibre es una imagen de su CSS; el de la app va en el DOM.
    button.replaceChildren(iconElement(locateIcon));
    render();

    const observer = new MutationObserver(restoreButton);
    observer.observe(button, { attributes: true, attributeFilter: ['disabled', 'title', 'aria-label'] });
    group.addEventListener('click', onClick, { capture: true });
    close.addEventListener('click', onClose);
    notice.addEventListener('keydown', onNoticeKeydown);
    control.on('geolocate', onFound);
    control.on('outofmaxbounds', onOutside);
    control.on('error', onError);

    return {
        relabel(next) {
            texts = next;
            render();
        },
        setOverlay(next) {
            resizes.disconnect();
            overlay = next;

            if (next) {
                resizes.observe(container);
                resizes.observe(next);
            }

            measure();
        },
        dispose() {
            observer.disconnect();
            resizes.disconnect();
            group.removeEventListener('click', onClick, { capture: true });
            control.off('geolocate', onFound);
            control.off('outofmaxbounds', onOutside);
            control.off('error', onError);
            notice.remove();
            announcer.remove();
        },
    };
}
