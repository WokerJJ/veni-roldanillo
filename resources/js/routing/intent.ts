/**
 * «Cómo llegar» desde la ficha (#13) abre el inicio con el restaurante en la
 * dirección (`/?r=slug`) y, además, con la ruta pedida. Que se pidió la ruta
 * no va en la dirección: un enlace compartido a `/?r=slug` abre el
 * restaurante, pero no pide la ubicación de quien lo abre. Queda aquí, en la
 * memoria de la página, entre el toque en la ficha y la llegada al inicio.
 */
let wanted: string | null = null;

/** La ficha de `slug` pide la ruta hasta él. */
export function askDirections(slug: string): void {
    wanted = slug;
}

/** Si alguien pidió la ruta hasta `slug`: lo dice una sola vez. */
export function takeDirections(slug: string): boolean {
    const asked = wanted === slug;
    wanted = null;

    return asked;
}
