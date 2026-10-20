/**
 * «Cómo llegar» (#11, ADR 0020): los tipos que comparten la capa de la ruta
 * (RouteLayer.vue), el panel que la explica (RouteDirections.vue) y el inicio,
 * más los enlaces a otras apps y los formatos de distancia y duración.
 *
 * Nada de esto lleva la posición de quien usa la app: la ruta solo sale de la
 * capa como distancia y duración, y los enlaces solo llevan el destino.
 */
import type { Locale } from '@/composables/useI18n';
import { intlLocale } from '@/i18n/intlLocale';

/** A pie o en carro: los dos perfiles del grafo de veni-mapa. */
export type RouteProfile = 'foot' | 'car';

export const PROFILES: readonly RouteProfile[] = ['foot', 'car'];

/** Lo que se muestra de una ruta: metros y segundos estimados. */
export interface RouteSummary {
    distance: number;
    duration: number;
}

/** En qué va el cálculo de la ruta. */
export type RouteState =
    /** Esperando la ubicación de «¿Dónde estoy?». */
    | { status: 'locating' }
    /** Bajando el grafo o calculando. */
    | { status: 'calculating' }
    /** La ruta de cada perfil, o `null` si con ese no hay. */
    | { status: 'ready'; routes: Readonly<Record<RouteProfile, RouteSummary | null>> }
    /** Ningún perfil llega: el destino no está conectado con la posición. */
    | { status: 'no-route' }
    /** La posición está a más de 1 km de cualquier vía del mapa. */
    | { status: 'far' }
    /** El restaurante está a más de 1 km de cualquier vía del mapa: desde ningún lado hay ruta. */
    | { status: 'destination-far' }
    /** La posición está fuera de la región del mapa. */
    | { status: 'outside' }
    /** El grafo no bajó (sin señal). */
    | { status: 'offline' }
    /** No hay con qué calcular: el grafo es de otro formato, falta su URL o el router falló. */
    | { status: 'error' }
    /** Sin permiso para la ubicación. */
    | { status: 'denied' }
    /** El dispositivo no da la ubicación (sin señal de GPS o tiempo agotado). */
    | { status: 'signal' }
    /** El navegador no tiene geolocalización. */
    | { status: 'unsupported' }
    /** Se apagó «¿Dónde estoy?»: sin ubicación no hay ruta. */
    | { status: 'off' }
    /** Sin mapa (no cargó) no hay de dónde salir. */
    | { status: 'unavailable' };

/**
 * Google Maps por su enlace universal, sin API ni clave: solo el destino. Sin
 * origen, Google Maps sale de donde esté el teléfono, que lo sabe por su cuenta.
 */
export function googleMapsUrl([longitude, latitude]: readonly [number, number], profile: RouteProfile): string {
    const query = new URLSearchParams({
        api: '1',
        destination: `${String(latitude)},${String(longitude)}`,
        travelmode: profile === 'foot' ? 'walking' : 'driving',
    });

    return `https://www.google.com/maps/dir/?${query.toString()}`;
}

/** Waze por su enlace universal: solo el destino, y que navegue hasta él. */
export function wazeUrl([longitude, latitude]: readonly [number, number]): string {
    const query = new URLSearchParams({ ll: `${String(latitude)},${String(longitude)}`, navigate: 'yes' });

    return `https://waze.com/ul?${query.toString()}`;
}

/** «350 m» o «1,9 km»: hasta un kilómetro, en metros redondeados a la decena. */
export function formatDistance(meters: number, locale: Locale): string {
    if (meters < 1000) {
        const rounded = Math.max(10, Math.round(meters / 10) * 10);

        return new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit: 'meter' }).format(rounded);
    }

    return new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(meters / 1000);
}

/** «4 min» o «1 h 5 min», redondeado hacia arriba al minuto. */
export function formatDuration(seconds: number, locale: Locale): string {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const unit = (value: number, name: 'hour' | 'minute'): string =>
        new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);

    if (minutes < 60) {
        return unit(minutes, 'minute');
    }

    const rest = minutes % 60;

    return rest === 0 ? unit(Math.floor(minutes / 60), 'hour') : `${unit(Math.floor(minutes / 60), 'hour')} ${unit(rest, 'minute')}`;
}
