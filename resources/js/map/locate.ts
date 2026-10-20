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
 * pasó, nunca dónde (ADR 0008). La única salida es la suscripción en memoria
 * de `subscribe`, que el motor le da a la ruta de «Cómo llegar» (#11, ADR
 * 0019 y 0020): se calcula y se dibuja en el dispositivo con ella.
 *
 * Solo importa tipos de MapLibre: el control lo crea engine.ts, el único que
 * lo importa.
 */
import type { GeolocateControl, GeolocateErrorEvent, Map as MapLibreMap } from 'maplibre-gl';

// Los dibujos son archivos del repositorio (colombia-icons, ADR 0011), no
// datos: viajan dentro del chunk del mapa y están siempre que esté el botón.
import closeIcon from '../../icons/colombia/cerrar.svg?raw';
import locateIcon from '../../icons/colombia/ubicacion.svg?raw';

import type { MapPadding } from './padding';

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

/**
 * Lo que pasa con la ubicación, para quien la usa dentro del dispositivo (la
 * ruta de #11): llegó una posición (`[longitud, latitud]`), hubo un problema
 * (el mismo que dice el aviso) o se apagó.
 */
export type LocateEvent = { type: 'position'; at: [number, number] } | { type: 'problem'; problem: LocateProblem } | { type: 'off' };

export interface LocateControl {
    /** Cambia los textos (otro idioma), sin tocar el estado. */
    relabel(texts: LocateTexts): void;
    /**
     * Pide la ubicación como si tocaran el botón, si no está encendido: el
     * permiso, si hace falta, lo pide el navegador. Encendido, no hace nada.
     */
    request(): void;
    /**
     * Avisa cada cambio de la ubicación, en memoria; si ya hay una posición, la
     * da enseguida. Devuelve con qué darse de baja.
     */
    subscribe(listener: (event: LocateEvent) => void): () => void;
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
 * Añade a `map`, arriba a la derecha, el control que da `create`, y pone los
 * avisos junto a su botón. `padding` dice cuánto del mapa tapa la página: la
 * cámara deja la ubicación en el centro de lo que queda a la vista.
 *
 * El botón lleva siempre el nombre de la app y, desde que MapLibre termina de
 * prepararlo (un momento después de añadirlo: antes no atiende el toque),
 * queda habilitado. MapLibre lo deshabilita si el navegador no tiene
 * geolocalización y cuando el permiso está negado (también si ya lo estaba
 * al cargar), y un botón deshabilitado no explica nada: así, tocarlo dice qué
 * pasa y cómo arreglarlo. Además le pone su nombre en inglés al terminar de
 * prepararlo y al cambiar de estado. Un observador deshace las dos cosas.
 *
 * Con el permiso negado, MapLibre apaga el control sin descontarlo de los que
 * siguen la ubicación (una cuenta de todo su módulo): el siguiente toque
 * pediría una posición vieja, sin precisión alta ni plazo, y el aviso de sin
 * señal no volvería. Por eso ahí el control se cambia por uno nuevo, que
 * MapLibre vuelve a contar desde cero; los avisos y el foco siguen.
 */
export function addLocateControl(map: MapLibreMap, create: () => GeolocateControl, initial: LocateTexts, padding: () => MapPadding): LocateControl {
    const container = map.getContainer();
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
    /** El foco estaba en el botón que se cambió: pasa al nuevo cuando esté listo. */
    let refocus = false;
    /** Quienes usan la ubicación en el dispositivo (la ruta), y lo último que pasó con ella. */
    const listeners = new Set<(event: LocateEvent) => void>();
    let last: LocateEvent = { type: 'off' };
    /** El botón estaba encendido (`aria-pressed`): al apagarse se avisa `off`. */
    let pressed = false;
    /** Se pidió la ubicación antes de que MapLibre terminara de preparar el botón. */
    let requested = false;

    const emit = (event: LocateEvent): void => {
        last = event;

        for (const listener of [...listeners]) {
            listener(event);
        }
    };

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
    announcer.className = 'veni-sr-only';
    announcer.setAttribute('aria-live', 'polite');
    container.append(announcer);

    let control: GeolocateControl;
    let button: HTMLButtonElement;
    let group: HTMLElement;

    /** MapLibre terminó de preparar el botón: con el seguimiento, le pone `aria-pressed`. */
    const ready = (): boolean => button.hasAttribute('aria-pressed');

    const restoreButton = (): void => {
        const nowPressed = button.getAttribute('aria-pressed') === 'true';

        if (pressed && !nowPressed) {
            emit({ type: 'off' });
        }

        pressed = nowPressed;

        if (ready()) {
            if (button.disabled) {
                button.disabled = false;
            }

            if (requested) {
                requested = false;
                button.click();
            }

            const focused = document.activeElement;

            if (refocus && (focused === null || focused === document.body)) {
                button.focus();
            }

            refocus = false;
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

            // Justo después del botón también en el orden del teclado: su
            // esquina termina con él, y el aviso va a continuación.
            if (!notice.isConnected) {
                (group.parentElement ?? group).after(notice);
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
        emit({ type: 'problem', problem: reason });

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
        shown.clear();
        located = false;
        hide();

        if (!(navigator as Partial<Navigator>).geolocation) {
            event.stopPropagation();
            report('unsupported');
        }
    };

    const onFound = (event: { coords: { longitude: number; latitude: number } }): void => {
        shown.clear();
        located = true;
        hide();
        emit({ type: 'position', at: [event.coords.longitude, event.coords.latitude] });
    };

    const onOutside = (): void => {
        report('outside');
    };

    const observer = new MutationObserver(restoreButton);

    const attach = (): void => {
        control = create();
        // Un control nuevo (el del permiso negado) empieza apagado: no avisa `off`.
        pressed = false;
        // MapLibre encuadra la ubicación con `fitBoundsOptions`, que lee cada
        // vez: el margen se mide ahí, con el panel y el mapa como estén.
        const fitBoundsOptions = { ...control.options.fitBoundsOptions };
        Object.defineProperty(control.options, 'fitBoundsOptions', {
            configurable: true,
            enumerable: true,
            get: () => ({ ...fitBoundsOptions, padding: padding() }),
        });
        map.addControl(control, 'top-right');

        const found = container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate');

        if (!found?.parentElement) {
            throw new Error('El control de geolocalización no está en el mapa.');
        }

        button = found;
        group = found.parentElement;
        // El ícono de MapLibre es una imagen de su CSS; el de la app va en el DOM.
        button.replaceChildren(iconElement(locateIcon));
        observer.observe(button, { attributes: true, attributeFilter: ['disabled', 'title', 'aria-label', 'aria-pressed'] });
        group.addEventListener('click', onClick, { capture: true });
        control.on('geolocate', onFound);
        control.on('outofmaxbounds', onOutside);
        control.on('error', onError);
    };

    const detach = (): void => {
        observer.disconnect();
        group.removeEventListener('click', onClick, { capture: true });
        control.off('geolocate', onFound);
        control.off('outofmaxbounds', onOutside);
        control.off('error', onError);
    };

    function onError(event: GeolocateErrorEvent): void {
        if (event.code !== PERMISSION_DENIED) {
            report('signal');

            return;
        }

        // Sin permiso, MapLibre acaba de deshabilitar el botón y apagar el
        // control: va uno nuevo en su lugar, y el foco con él.
        const focused = document.activeElement;
        refocus = focused === null || focused === document.body || group.contains(focused);
        detach();
        map.removeControl(control);
        attach();
        report('denied');
    }

    attach();
    render();
    close.addEventListener('click', onClose);
    notice.addEventListener('keydown', onNoticeKeydown);

    return {
        relabel(next) {
            texts = next;
            render();
        },
        request() {
            // Antes de estar listo, MapLibre no atiende el toque: va cuando lo esté.
            if (!ready()) {
                requested = true;
            } else if (button.getAttribute('aria-pressed') !== 'true') {
                // Por el mismo camino que un toque: sin geolocalización, el aviso.
                button.click();
            }
        },
        subscribe(listener) {
            listeners.add(listener);

            if (last.type === 'position') {
                listener(last);
            }

            return () => {
                listeners.delete(listener);
            };
        },
        dispose() {
            listeners.clear();
            detach();
            notice.remove();
            announcer.remove();
        },
    };
}
