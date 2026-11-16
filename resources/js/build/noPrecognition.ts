/*
| Lo que queda de `laravel-precognition` en Vení (vite.config.ts lo pone en su
| lugar con un alias). Esa librería es la validación en vivo de `useForm`, que
| Vení no usa; pero @inertiajs/core la importa y la configura al cargarse
| (`client.withSerializer(…)`), y con eso su cliente entero viajaba en el
| arranque de todo el que abre la app.
|
| Aquí está solo lo que Inertia toca al cargarse, sin hacer nada. Lo que sí
| validaría (`createValidator`) falla diciendo por qué: si algún día hace
| falta la validación en vivo, se quita el alias de vite.config.ts y vuelve la
| librería de verdad.
*/

interface Client {
    withSerializer: () => Client;
    withXsrfCookieName: () => Client;
    withXsrfHeaderName: () => Client;
}

export const client: Client = {
    withSerializer: () => client,
    withXsrfCookieName: () => client,
    withXsrfHeaderName: () => client,
};

export function createValidator(): never {
    throw new Error('laravel-precognition no viaja en Vení (resources/js/build/noPrecognition.ts): quitá el alias de vite.config.ts para usarla.');
}

export const resolveName = (name: unknown): unknown => name;

export const toSimpleValidationErrors = (errors: unknown): unknown => errors;
