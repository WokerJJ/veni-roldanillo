import type { RestaurantCategory } from './api';
import type { SpecialHours, WeeklyHours } from './openStatus';

/**
 * La ficha de un restaurante: la prop `restaurant` de la página
 * Restaurants/Show, tal como la arma App\Http\Resources\RestaurantProfile
 * (una lista blanca: aquí no hay nada que no se pueda mostrar).
 *
 * La forma de la prop está en tests/contracts/restaurant.profile.json:
 * tests/Feature/RestaurantPageTest.php la compara con lo que manda el
 * servidor, y de ella parte la ficha de las pruebas de la página
 * (resources/js/testing/restaurants.ts), que tiene que caber en estos tipos.
 */

/** Los valores de App\Enums\PaymentMethod. */
export type PaymentMethod = 'cash' | 'nequi' | 'daviplata' | 'card';

/** Un horario especial con la nota del restaurante («Festivo»), en el idioma de la página. */
export interface ProfileSpecialHours extends SpecialHours {
    note: string | null;
}

export interface DeliveryZone {
    /** El nombre del barrio. */
    neighborhood: string;
    /** Costo del domicilio, en pesos. */
    fee: number;
}

export interface MenuDish {
    name: string;
    description: string | null;
    /** En pesos, sin decimales. */
    price: number;
    /**
     * «Agotado hoy»: sigue en el menú, pero no hay hasta esta fecha
     * (`YYYY-MM-DD`), incluida. Si hoy está agotado lo calcula el
     * dispositivo con el día de Colombia, como «abierto ahora».
     */
    sold_out_until: string | null;
}

export interface MenuSection {
    name: string;
    dishes: MenuDish[];
}

export interface RestaurantProfile {
    /** Identificador público; el de la URL de la ficha. */
    slug: string;
    name: string;
    description: string | null;
    categories: RestaurantCategory[];
    /** Dato de ejemplo: la interfaz lo marca «Datos de ejemplo». */
    fictitious: boolean;
    /** Oculta al público: solo la reciben la gente del restaurante y la administración. */
    hidden: boolean;
    /** Sin reclamar: nadie del restaurante confirmó estos datos. */
    unverified: boolean;
    /** Día de la última actualización (`YYYY-MM-DD`). */
    updated_on: string | null;
    /** De 1 a 4. */
    price_level: number | null;
    address: string | null;
    reference: string | null;
    phone: string | null;
    /** `57` y diez dígitos, como lo pide wa.me. */
    whatsapp: string | null;
    payment_methods: PaymentMethod[];
    delivery: {
        available: boolean;
        notes: string | null;
        /** Vacía: hace domicilios, pero el costo hay que preguntarlo. */
        zones: DeliveryZone[];
    };
    /** El mismo horario que recibe el mapa: con él se calcula «abierto ahora» (ADR 0017). */
    hours: WeeklyHours[];
    special_hours: ProfileSpecialHours[];
    /** Secciones con platos, en el orden del restaurante. */
    menu: MenuSection[];
}
