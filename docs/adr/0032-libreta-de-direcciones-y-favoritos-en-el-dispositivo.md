# ADR 0032 · Libreta de direcciones y favoritos en el dispositivo: una libreta para todos los restaurantes, «Recordar» la alimenta y los favoritos son solo slugs

- Estado: aceptada
- Fecha: 2026-10-31
- Precisa: ADR 0015 (qué se guarda en el dispositivo) y ADR 0024 (el carrito y «Recordar» por restaurante, que dejaba la libreta para después).
- Afecta a: `resources/js/device/localStore.ts`; `resources/js/saved/addresses.ts`, `favorites.ts`, `labels.ts` y `clearAll.ts`; `resources/js/order/storage.ts` y `useOrder.ts`; `resources/js/components/OrderCart.vue`, `FavoriteButton.vue`, `SavedOnDevice.vue`, `RestaurantList.vue` y `RestaurantSummary.vue`; `resources/js/pages/Restaurants/Show.vue`; `lang/{es,en}.json`.

## Contexto

Con #15 el carrito recuerda barrio, dirección, referencia y nombre solo si la persona marca «Recordar», y por restaurante (`veni:delivery:<slug>`, 90 días). Quien pide en tres restaurantes escribe tres veces la misma dirección, y quien pide a la casa y al trabajo tiene un solo lugar por restaurante. El producto pide además favoritos guardados en el dispositivo (docs/02-producto.md) y #16 junta las dos cosas.

Había que decidir dónde viven, cómo conviven con el «Recordar» de #15 sin dos lugares para lo mismo, qué límites tienen, dónde se editan y se borran, y cómo se garantiza que nada de esto llega al servidor (regla 2 de producto), sin sumar al arranque (`resources/js/map/bundle.test.ts`, 83 kB).

## Alternativas

- **Guardarlas en el servidor, con cuenta.** Vení no tiene cuentas de comensal y no las quiere para pedir (ADR 0004): una dirección en el servidor es un dato personal más que custodiar (Ley 1581) a cambio de sincronizar entre teléfonos, que nadie pidió. Descartada.
- **Libreta aparte y «Recordar» por restaurante como está.** Dos lugares para la misma dirección: se borra de uno y sigue en el otro, y «Borrar» deja de decir la verdad. Descartada.
- **Una dirección por restaurante, pero con etiqueta.** No resuelve escribirla en cada restaurante. Descartada.
- **«Recordar» guarda en la libreta (la elegida).** Ver la decisión.
- **Guardar el modo (domicilio o recoger) junto a la dirección.** El modo es del pedido y del restaurante, no de la dirección; con la libreta global ya no hay dónde ponerlo sin volver a guardar por restaurante. Descartada: el carrito arranca en domicilio si el restaurante lo hace, como siempre.
- **Favoritos con nombre y datos del restaurante.** Envejecen (cambia el nombre, se oculta la ficha) y crecen. Descartada: solo el slug, y lo demás sale de la lista del mapa.
- **Filtro «Favoritos» en la dirección (`?fav=1`), como los de ADR 0028.** La dirección se comparte, y lo que una persona marcó como favorito no le dice nada a quien recibe el enlace; además la capa del mapa tendría que leer el almacenamiento. Descartada por ahora: una sección «Tus favoritos» en la lista.
- **Una página `/saved`.** Sería una ruta del servidor para una pantalla que no le pide nada. Descartada: un diálogo que baja con `import()`, desde la lista del inicio y desde el carrito.

## Decisión

**Una libreta para todos los restaurantes** (`saved/addresses.ts`, `veni:addresses`): hasta 10 direcciones, cada una con etiqueta («Casa» y «Trabajo», que se guardan como clave y se leen en el idioma de la pantalla, u «Otra» con el nombre que escriba la persona, 30 caracteres), barrio, dirección, referencia y nombre opcional, con los largos del formulario del carrito. Cada una vence un año después de la última vez que se usó o se guardó. Nunca la ubicación, el medio de pago ni «¿con cuánto pagás?»: se copian solo esos campos, aunque el objeto traiga más.

**«Recordar» pasa a ser «Guardar esta dirección»** y alimenta la libreta: marcada, la dirección del formulario se guarda (o se pone al día la que se eligió) con cada cambio; desmarcada, se borra de la libreta, como desmarcar «Recordar» borraba lo recordado. Solo se ofrece con domicilio: al recoger no hay dirección. Al abrir el carrito se completa con la usada más recientemente; arriba del barrio se elige otra o «Otra dirección». Con zonas, un barrio guardado que no es de este restaurante no se elige solo: se dice y se pide de la lista, sin borrarlo de la libreta. Con la libreta llena, la casilla no se marca y dice por qué.

**Migración desde #15**: lo que haya en `veni:delivery:<slug>` se lee una vez, al abrir el carrito de ese restaurante, pasa a la libreta (o se junta con una igual) y se borra. El modo guardado se usa esa vez. `storage.ts` ya no escribe datos de entrega.

**Favoritos** (`saved/favorites.ts`, `veni:favorites`): solo el slug, del último marcado al primero, hasta 100. Se marcan con `FavoriteButton.vue`, un botón de alternar (`aria-pressed`) con nombre fijo («Favorito»), el corazón relleno al marcarlo y el cambio anunciado en una región de estado, en la ficha (si no está oculta) y en el resumen del mapa. La lista del inicio muestra «Tus favoritos» arriba cuando no hay filtros, con los que están en el mapa: uno que se ocultó o se retiró no aparece y no rompe nada; si vuelve, vuelve como favorito.

**Gestionar y borrar todo**: `SavedOnDevice.vue`, un `<dialog>` modal como el carrito (hoja de abajo en el celular, ADR 0022), lista, agrega, edita y borra direcciones y quita favoritos. Se abre con «Guardado en este teléfono» al final de la lista del inicio y con «Editar o borrar tus direcciones» en el carrito (encima de él y sin favoritos, porque ahí no están los nombres de los restaurantes). «Borrar todo lo guardado», con confirmación, borra la libreta, los favoritos, lo que quede de `veni:delivery:*` y los pedidos sin enviar; quedan el idioma y el tema, que no dicen nada de la persona.

**Cómo se guarda**: `device/localStore.ts` junta el acceso que ya usaba el carrito (try/catch en cada acceso, sin almacenamiento la app funciona y solo no recuerda) y lo usan el carrito, la libreta y los favoritos. Cada formato va en un sobre con versión (`{ v: 1, data }`); lo leído se valida campo por campo y una entrada dañada se descarta sola, sin llevarse a las demás; lo que pasa del tamaño máximo (20 000 caracteres la libreta, 12 000 los favoritos) no se lee. Libreta y favoritos viven en la memoria de la pestaña, compartida por todas las pantallas, y siguen lo que escriben otras pestañas (evento `storage`).

**Nunca en el servidor**: ninguna petición nueva. `saved/noNetwork.test.ts` revisa que el código de la libreta, los favoritos y sus pantallas no tenga con qué pedir nada (`fetch`, `XMLHttpRequest`, `sendBeacon`, Inertia y demás) y que guardar, leer y borrar no llame a nada.

**Arranque**: el diálogo baja con `import()` al abrirlo, desde la lista o el carrito, montado con `h()` y no con `<component :is>` ni `defineAsyncComponent`; el botón de favorito viaja con el resumen y con la ficha. Sin clases nuevas de Tailwind: los estilos propios del diálogo van con él, y el corazón del botón se rellena con un estilo en línea (CSSOM, que la CSP permite): con una hoja propia, el botón sumaba un chunk de estilos y el helper de estilos con alcance a la lista de dependencias que el arranque guarda de lo que baja después, y el arranque llegaba a 83,05 kB, fuera del presupuesto. Así, medido con `bundle.test.ts`, pasa de 82,985 (main) a 82,971 kB.

## Consecuencias

- Una dirección se escribe una vez y sirve en todos los restaurantes; «Borrar esta dirección» y desmarcar la casilla la borran de verdad, de un solo lugar.
- Se pierde recordar el modo (domicilio o recoger) por restaurante: el carrito vuelve a empezar en domicilio. Recoger no pide dirección, y el nombre sale de la dirección usada más recientemente.
- Con la libreta, el teléfono guarda más datos personales y por más tiempo (un año desde el último uso, no 90 días). La política de datos lo tiene que decir (el texto va con la versión 0.3 de `lang/{es,en}/documents.php`).
- Los favoritos no viajan entre teléfonos ni sobreviven a borrar los datos del navegador; es el precio de no tener cuentas, y la pantalla lo dice.
- Un favorito de una ficha oculta queda guardado sin verse; se puede quitar desde «Guardado en este teléfono», donde aparece como «un restaurante que ya no está en el mapa».
- Si después se quiere un filtro «Favoritos» en el mapa, tendrá que vivir fuera de la dirección (la capa leería los favoritos del almacenamiento) o con otro ADR.
