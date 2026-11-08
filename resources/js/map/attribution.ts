/**
 * La atribución de OpenStreetMap (ADR 0003 y 0021) según el ancho (#139,
 * ADR 0041).
 *
 * En computador (desde 1024 px) es la de MapLibre, desplegada abajo a la
 * derecha con el texto y el enlace que trae el estilo de veni-mapa.
 *
 * En el celular es compacta, arriba a la izquierda, frente a los botones de
 * zoom: al cargar el mapa se ve el crédito («© colaboradores de
 * OpenStreetMap», un enlace a los créditos de la app) junto a un botón
 * redondo «i» de 44 px; con el primer toque o movimiento del mapa el crédito
 * se pliega y queda el botón, que lo vuelve a abrir. Es lo que acepta la guía
 * de atribución de la OSMF para pantallas chicas: plegada, siempre a un toque,
 * y a la vista al cargar. Así abajo no queda una franja suelta entre el panel
 * y la barra de pestañas.
 *
 * El control propio, y no el `compact` de MapLibre: aquel es un `<details>`
 * que queda abierto aunque se vea plegado (el lector oye «expandido»), solo
 * se pliega al arrastrar (no al tocar ni con el teclado) y su botón no tiene
 * el tamaño ni el nombre de los demás.
 */
import type { IControl, Map as MapLibreMap, MapLibreEvent } from 'maplibre-gl';

import infoIcon from '../../icons/colombia/informacion.svg?raw';

import { iconElement } from './locate';

/** Los textos del crédito compacto, en el idioma de la interfaz. */
export interface AttributionTexts {
    /** Nombre accesible del botón «i»: «Créditos del mapa». */
    button: string;
    /** El crédito: «© colaboradores de OpenStreetMap». */
    credit: string;
}

export interface AttributionHandle {
    relabel(texts: AttributionTexts): void;
    dispose(): void;
}

/**
 * A donde lleva el crédito compacto: los créditos de la app, con el enlace a
 * openstreetmap.org/copyright y la licencia (ADR 0021). Un enlace común, que
 * recarga la app: la visita de Inertia desde el chunk del mapa partía la
 * entrada (+7,6 kB), y pasarla desde el inicio sumaba al arranque.
 */
export const CREDITS_URL = '/credits';

/**
 * Lo que pliega el crédito: tocar el mapa (o apretar el mouse sobre él) y
 * cualquier movimiento de quien lo usa (arrastrar, pellizcar, la rueda, las
 * flechas). Los movimientos de la app (ir hasta el elegido) no traen
 * `originalEvent`: esos no lo pliegan.
 */
const INTERACTIONS = ['mousedown', 'touchstart', 'movestart'] as const;

/**
 * Desde este ancho, la de computador: el DESKTOP_QUERY de
 * composables/useMediaQuery.ts (ADR 0037), escrito aquí y no importado: una
 * importación de la app desde el chunk del mapa partía la entrada (una prueba
 * compara las dos).
 */
export const WIDE_QUERY = '(min-width: 64rem)';

let ids = 0;

class CompactAttribution implements IControl {
    private map: MapLibreMap | null = null;
    private readonly container = document.createElement('div');
    private readonly button = document.createElement('button');
    private readonly panel = document.createElement('p');
    private readonly link = document.createElement('a');

    constructor(private texts: AttributionTexts) {
        ids += 1;
        this.panel.id = `veni-attrib-${String(ids)}`;
    }

    onAdd(map: MapLibreMap): HTMLElement {
        this.map = map;
        this.container.className = 'maplibregl-ctrl veni-attrib';

        this.button.type = 'button';
        this.button.className = 'veni-attrib-button';
        this.button.setAttribute('aria-controls', this.panel.id);
        this.button.append(iconElement(infoIcon));
        this.button.addEventListener('click', this.toggle);

        this.panel.className = 'veni-attrib-text';
        this.link.href = CREDITS_URL;
        this.panel.append(this.link);

        this.container.append(this.button, this.panel);
        this.relabel(this.texts);
        this.setOpen(true);

        for (const type of INTERACTIONS) {
            map.on(type, this.onInteraction);
        }

        return this.container;
    }

    onRemove(): void {
        for (const type of INTERACTIONS) {
            this.map?.off(type, this.onInteraction);
        }

        this.button.removeEventListener('click', this.toggle);
        this.container.remove();
        this.map = null;
    }

    relabel(texts: AttributionTexts): void {
        this.texts = texts;
        this.button.setAttribute('aria-label', texts.button);
        this.button.title = texts.button;
        this.link.textContent = texts.credit;
    }

    private setOpen(open: boolean): void {
        this.button.setAttribute('aria-expanded', String(open));
        this.panel.hidden = !open;
    }

    private readonly toggle = (): void => {
        this.setOpen(this.button.getAttribute('aria-expanded') !== 'true');
    };

    private readonly onInteraction = (event: MapLibreEvent): void => {
        if ((event as { originalEvent?: unknown }).originalEvent !== undefined) {
            this.setOpen(false);
        }
    };
}

/**
 * Pone la atribución que va con el ancho de ahora y la cambia al cruzar
 * 1024 px (girar la tableta, agrandar la ventana). `full` crea la de MapLibre
 * (la crea engine.ts, que es quien importa sus clases).
 */
export function addAttribution(map: MapLibreMap, full: () => IControl, texts: AttributionTexts): AttributionHandle {
    const wide = window.matchMedia(WIDE_QUERY);
    let current: IControl | null = null;
    let compact: CompactAttribution | null = null;
    let labels = texts;

    const place = (): void => {
        if (current !== null) {
            map.removeControl(current);
        }

        compact = wide.matches ? null : new CompactAttribution(labels);
        current = compact ?? full();
        map.addControl(current, compact ? 'top-left' : 'bottom-right');
    };

    place();
    wide.addEventListener('change', place);

    return {
        relabel(next) {
            labels = next;
            compact?.relabel(next);
        },
        dispose() {
            wide.removeEventListener('change', place);
        },
    };
}
