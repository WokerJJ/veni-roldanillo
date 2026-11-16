import { removeWithPrefix, writeItem } from '@/device/localStore';
import { DELIVERY_PREFIX } from '@/order/storage';
import { forgetAllOrders } from '@/order/useOrder';

import { useAddressBook } from './addresses';
import { useFavorites } from './favorites';

/**
 * «Borrar todo lo guardado» (#16, ADR 0032): lo que la app guardó en este
 * teléfono sobre quien la usa. La libreta de direcciones, los favoritos, los
 * datos de entrega que «Recordar» guardaba por restaurante antes de la
 * libreta (#15), los pedidos sin enviar y la última lista de restaurantes que
 * llegó (#144, ADR 0046). Quedan el idioma y el tema, que
 * son preferencias de la pantalla y no dicen nada de la persona.
 */
export function clearAllSaved(): void {
    useAddressBook().clear();
    useFavorites().clear();
    removeWithPrefix(DELIVERY_PREFIX);
    forgetAllOrders();
    // La clave de resources/js/restaurants/savedList.ts, repetida: importarla
    // traería ese módulo al arranque, y se baja aparte (ADR 0046).
    writeItem('veni:restaurants', null);
}
