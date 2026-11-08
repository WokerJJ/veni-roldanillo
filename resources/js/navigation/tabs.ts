import type { Component, InjectionKey } from 'vue';
import { ref, shallowRef } from 'vue';

/**
 * Qué muestra el panel del inicio en el celular, compartido entre el inicio
 * y la barra de pestañas (#139, ADR 0041): `false` con la lista cerrada (la
 * pestaña «Mapa») y, con la lista abierta, dónde toma el foco: su título
 * («Lista»), «Almuerzos de hoy» o el buscador (el botón de buscar).
 *
 * Es un estado único de la pestaña (un módulo, no `provide`): la barra y el
 * inicio lo importan de aquí, y las pruebas empiezan de cero con
 * `resetHomeList()`. Vive con el layout, que viaja en el arranque, y no en la
 * barra, que baja aparte: así el inicio no espera a la barra ni suma un chunk
 * al arranque.
 */
export type HomeList = false | 'heading' | 'lunches' | 'search';

export const homeList = ref<HomeList>(false);

/**
 * Sube con cada orden de mostrar la lista (`showHomeList`), aunque pida lo
 * mismo que ya se ve: tocar «Lista» con un elegido vuelve a la lista, y
 * buscar con la lista abierta vuelve al buscador. El valor de `homeList` solo
 * dice el estado; si no cambia, nada lo vigila.
 */
export const homeListRequest = ref(0);

/** La barra de pestañas pide mostrar la lista así: `false` la cierra. */
export function showHomeList(start: HomeList): void {
    homeList.value = start;
    homeListRequest.value += 1;
}

/**
 * La lista publicada que trajo el inicio (solo se mira el slug), o null si en
 * esta pestaña todavía no llegó (otra página, sin señal). Con ella, «Pedido»
 * no ofrece el carrito de un restaurante que ya no está publicado.
 */
export const published = shallowRef<readonly { slug: string }[] | null>(null);

/** Solo para las pruebas: la lista cerrada, sin órdenes y sin la lista publicada. */
export function resetHomeList(): void {
    homeList.value = false;
    homeListRequest.value = 0;
    published.value = null;
}

/**
 * El idioma y el tema, que el layout lleva en la cabecera, para los
 * «Ajustes» del inicio en el celular (#139): el layout los da y el inicio los
 * pone en su panel. Importarlos desde el inicio, o desde lo que baja aparte,
 * partía el chunk de la entrada en tres y sumaba 7,6 kB al arranque.
 */
export const SETTINGS: InjectionKey<readonly Component[]> = Symbol('ajustes');
