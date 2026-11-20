# ADR 0047 · El arranque sin lo que Vení no usa de Inertia y de Vue

- Estado: aceptada
- Fecha: 2026-11-16
- Precisa: ADR 0007 y 0022 (qué baja al abrir la app y qué se pide después) y el presupuesto del arranque de `resources/js/map/bundle.test.ts`, que desde el ADR 0020 era de 83 kB comprimidos. Revierte la subida a 83,5 kB que se hizo durante el #144 (ADR 0046).
- Afecta a: `vite.config.ts`, `resources/js/build/noPrecognition.ts` (nuevo) y `resources/js/map/bundle.test.ts`.

## Contexto

El arranque (la entrada, la página de inicio y sus estilos) llevaba meses pegado a su tope de 83 kB: cada funcionalidad se medía en bytes y varias se rehicieron para no pasarlo. Con la lista guardada sin señal (#144) quedó en 82,994 kB en un equipo y 83,006 en CI, y el tope se subió a 83,5.

Hasta ahí todo el esfuerzo había sido sobre el código propio, que es la parte chica. Midiendo módulo por módulo, de los 83 kB la entrada pesa 65, y casi todo es de terceros: Vue, Inertia y lo que Inertia arrastra. Ahí había código que Vení no usa y que baja todo el que abre la app con datos móviles (regla de producto 8).

## Qué viajaba sin usarse

- **`useForm` de Inertia y su validación en vivo.** Vení no usa `useForm` ni `<Form>`: sus formularios van con el router (`requests/useRequestForm.ts`). Pero el plugin de `@inertiajs/vue3`, al instalarse, hace `router.form = useForm`, y con esa línea el compilador no puede descartar `useForm`, su estado ni `laravel-precognition`.
- **El cliente de `laravel-precognition`.** `@inertiajs/core` lo importa y lo configura al cargarse (`client.withSerializer(…)`), se use o no.
- **La API de opciones de Vue** (`data`, `methods`, mixins). Todos los componentes de Vení son `<script setup>` o `setup()`, y los de Inertia que usa (`Link`, `Head`, la app) también.

## Alternativas

- **Seguir recortando el código propio.** Es lo que se venía haciendo: cuesta legibilidad (el alias `Old` del #144) y rinde bytes, no kilobytes.
- **Subir el tope.** Es lo que se hizo en el #144 y lo que este ADR revierte: el tope existe por quien abre la app con mala señal.
- **Cambiar Inertia por otra cosa, o parchear `node_modules`** (`patch-package`). Desproporcionado lo primero; lo segundo se rompe en silencio al actualizar.
- **Decirle al compilador qué no se usa, en `vite.config.ts`, con pruebas que lo vigilen.** Elegida.

## Decisión

- **`dropInertiaForms()`**, un plugin de compilación que quita la línea `router4.form = useForm;` de `@inertiajs/vue3`. Si la línea ya no está (una versión nueva de Inertia), la compilación se detiene con un mensaje: hay que volver a mirar. `useForm` no queda prohibido, pero importarlo en la entrada (`app.ts` o lo que carga con ella) lo trae de vuelta con su validación y sube el arranque: hay que cargarlo con `import()` o subir el tope, con su ADR. La prueba de la entrada falla con un mensaje que apunta aquí. Lo que deja de existir es `router.form`.
- **Un alias de `laravel-precognition`** a `resources/js/build/noPrecognition.ts`: lo mínimo que Inertia toca al cargarse, sin hacer nada (su `client` es un `Proxy` que devuelve siempre el mismo cliente ante cualquier método: una versión nueva de Inertia que encadene otro no rompe el arranque), y un `createValidator` que falla diciendo por qué. Si algún día hace falta la validación en vivo, se quita el alias.
- **`__VUE_OPTIONS_API__: false`**: Vue deja fuera el código que atiende la API de opciones. De paso `app.mixin` no hace nada: la opción `remember` de Inertia (que es un mixin) deja de funcionar; Vení no la usa, y la prueba de abajo también la vigila.
- **El tope del arranque baja de 83 a 76 kB.** Medido: 82,994 antes; sin `useForm`, −3,7 kB; sin el cliente de precognition, −2,7 kB; sin la API de opciones, −1,7 kB. Quedó en 74,888.
- **Pruebas nuevas en `bundle.test.ts`.** Sobre la compilación real: la entrada no trae la validación en vivo (`withPrecognition`; prueba además que los plugins de `vite.config.ts` corrieron) ni el código de la API de opciones de Vue (`beforeCreate`, que solo aparece en lo que la atiende). Sobre el código: ningún archivo de `resources/js` usa `router.form`, `laravel-precognition` ni escribe opciones de la API de opciones (`data`, `methods`, `computed`, `watch`, `mixins`, `extends`, `components`, `provide`, `inject`, `remember` y los ganchos como opción) y ningún `<script>` normal de un `.vue` exporta claves fuera de `name`, `props`, `emits`, `setup`, `expose` e `inheritAttrs` (se lee con el compilador de Vue, sin expresiones regulares); la expresión tiene su propia prueba con ejemplos para que no se degrade. Además, `noPrecognition.test.ts` prueba el cliente sustituto.
- **En dev y en Vitest nada de esto aplica** (alias, `define` y plugin solo en el build): las pruebas de arriba compilan con `build()`, y las demás pruebas de Vitest corren con la librería y el Vue de siempre.

## Consecuencias

- Quien abre la app baja unos 8 kB menos (cerca del 10 % del arranque), en todas las páginas: es la entrada.
- Hay 1,1 kB de margen bajo el tope nuevo: una funcionalidad chica ya no obliga a contar bytes.
- Tres cosas que alguien que venga de otro proyecto de Inertia o Vue daría por hechas no están: `router.form`, la validación en vivo y la API de opciones. Las tres fallan en una prueba o al compilar, no en producción, salvo un componente de terceros escrito con la API de opciones (hoy no hay ninguno; al sumar una librería de componentes de Vue hay que revisarlo).
- Actualizar `@inertiajs/vue3` puede detener la compilación si cambió esa línea: es a propósito.
- Las pruebas de Vitest corren con el Vue de desarrollo, que ignora el interruptor: lo que lo comprueba es la compilación. Se miró en el navegador con la compilación de producción: el inicio, la navegación a la guía, el cambio de idioma, la ficha y agregar un plato al pedido. No se probó el panel del dueño ni un celular real.
