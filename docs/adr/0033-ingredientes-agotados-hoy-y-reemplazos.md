# ADR 0033 · Ingredientes agotados hoy con reemplazo: una lista por restaurante, publicada solo cuando falta algo y aplicada en el dispositivo

- Estado: aceptada
- Fecha: 2026-11-01
- Precisa: ADR 0009 (modelo de datos), ADR 0018 (la ficha por lista blanca y «agotado hoy» en el dispositivo), ADR 0023 (opciones y quitar ingredientes), ADR 0024 (carrito y mensaje), ADR 0025 y 0027 (paneles en Filament) y ADR 0029 (búsqueda por plato).
- Afecta a: tablas `ingredients` y `dish_ingredient`, `options.ingredient_id`, `App\Models\Ingredient` y `DishIngredient`, `Dish::orderableToday`, `RestaurantController`, `App\Http\Resources\RestaurantProfile`, `tests/contracts/restaurant.profile.json`, `IngredientResource`, `DishResource`, `OptionGroupsRelationManager`, `resources/js/order/ingredients.ts`, `selection.ts`, `message.ts`, `storage.ts`, `DishPicker.vue`, `RestaurantMenu.vue`, `MenuDishLine.vue` y `OrderCart.vue`.

## Contexto

Hasta #112, «agotado hoy» era solo del plato (#18) y «quitar» era un texto dentro de un grupo de opciones (#14, ADR 0023). Cuando se acaba el tomate, el dueño tenía que tocar cada plato que lo lleva, y el cliente no se enteraba hasta que el restaurante le contestaba por WhatsApp. El dueño pidió (issue #112) marcar una sola vez que hoy no hay un ingrediente, que el menú se ajuste solo y poder ofrecer un reemplazo con recargo, que el cliente acepta o no.

Había que decidir dónde vive la lista, cómo se garantiza que todo sea del mismo restaurante, qué viaja a la ficha, dónde se aplica el efecto («hoy» cambia a la medianoche), cómo queda en el pedido y en el mensaje, y qué pasa con la búsqueda por plato.

## Alternativas

- **Ingredientes por plato (texto) en vez de una lista común.** Es lo que había con «quitar»: el tomate de la bandeja y el del arroz son dos textos, y agotarlo obliga a tocar cada plato. No resuelve el pedido.
- **Seguir usando las opciones de quitar como ingredientes.** Una opción vive en un grupo de un plato; agotarla es, otra vez, por plato. Además no dice si el ingrediente es esencial ni tiene reemplazo.
- **`restaurant_id` en `options` para una FK compuesta.** Daría la misma garantía que `dish_ingredient`, pero duplica en cada opción un dato que ya sale de su grupo y su plato, y habría que mantenerlo al día. Se eligió un disparador (abajo).
- **Publicar la lista entera de ingredientes en la ficha.** Casi siempre no hay ninguno agotado: serían bytes y una consulta por nada, y la lista es del dueño (ADR 0018: lo que no hace falta, no viaja).
- **Decidir en el servidor si hoy está agotado.** La ficha puede quedar abierta de un día para otro (PWA); con los platos ya se decidió calcularlo en el dispositivo con el día de Colombia (ADR 0018). Igual aquí.
- **Reindexar Meilisearch al cambiar un ingrediente.** El documento del índice no lleva «agotado hoy» (ADR 0029): se mira en la base al responder. Reindexar todos los platos de un ingrediente por un estado que vence solo a la medianoche dejaría el índice desactualizado al día siguiente sin que nadie lo toque.

## Decisión

- **Modelo (migración `2026_11_01_100000`, solo hacia adelante en producción).**
  - `ingredients`: por restaurante, `name_es` (80) y `name_en`, `sold_out_until` (fecha del día, como `dishes`), `substitute_ingredient_id` y `substitute_price_delta` (pesos enteros, 0 a 100 000). Únicos `(id, restaurant_id)` y `(restaurant_id, lower(name_es))`.
  - El reemplazo es del mismo restaurante por una FK compuesta `(substitute_ingredient_id, restaurant_id)` con `ON DELETE SET NULL (substitute_ingredient_id)` (PostgreSQL 15+): si se borra el reemplazo, el ingrediente queda sin reemplazo y su `restaurant_id` no se toca. El CHECK `ingredients_substitute_valid` impide que un ingrediente sea su propio reemplazo y un recargo negativo.
  - `dish_ingredient` (con id propio, para editarlo como repetidor): `restaurant_id`, `dish_id`, `ingredient_id`, `essential`. Dos FK compuestas (`dishes (id, restaurant_id)`, que gana el único `dishes_id_restaurant_id_unique`, e `ingredients (id, restaurant_id)`) obligan a que plato e ingrediente sean del mismo restaurante, con borrado en cascada. Único `(dish_id, ingredient_id)`. `restaurant_id` no es asignable: `DishIngredient` lo copia del plato al crearse.
  - `options.ingredient_id`, nullable, `ON DELETE SET NULL`. Como `options` no tiene `restaurant_id`, el disparador `options_ingredient_same_restaurant` rechaza (SQLSTATE 23514, con el nombre de la restricción) un ingrediente de otro restaurante que el del plato del grupo. Vale para opciones de quitar y para adiciones.
- **Panel del dueño.** `IngredientResource` (tope de 100 por restaurante): nombre ES/EN, «Agotado hoy» (interruptor en el formulario y acción en la tabla, que vence a la medianoche de Colombia y mueve «Actualizada el…»), reemplazo (solo otros ingredientes del restaurante) y recargo, que vuelve a 0 sin reemplazo. Borrar avisa en cuántos platos y opciones está; la base lo quita de esos platos y deja las opciones sin ingrediente. En el plato, un repetidor «Ingredientes del plato» (hasta 20, sin repetir) con «Esencial». En cada opción, «Ingrediente (opcional)». Las selecciones solo ofrecen y aceptan (`Rule::exists` con `restaurant_id`) los del restaurante de la dirección; la base lo vuelve a exigir. Autorización con `RestaurantContentPolicy`, como todo el contenido.
- **Ficha (lista blanca).** Cada plato lleva `ingredients`: solo los agotados desde hoy (en el día de Colombia) que lo tocan, en orden alfabético: `name`, `essential`, `in_dish` (lo lleva el plato, o lo nombra uno de sus «Quitar»; si no, solo una adición), `sold_out_until` y `substitute` (`name`, `price`, `sold_out_until`) o null. Cada opción lleva `ingredient`: la posición de su ingrediente en esa lista si está agotado, o null. El id de la base no viaja. Cuesta una consulta más fija (los agotados del restaurante) y dos más solo si hay alguno (reemplazos y platos que los llevan), tenga el menú los platos que tenga.
- **Efecto, en el dispositivo** (`resources/js/order/ingredients.ts`, funciones puras con el día que calcula el menú, como «agotado hoy»):
  - Esencial agotado: «No disponible hoy · sin X»; el plato no es botón y `toOrderItem` no lo arma.
  - No esencial sin reemplazo (o con el reemplazo también agotado): «Hoy sin X»; su «Quitar X», si existe, queda marcado y fijo.
  - No esencial con reemplazo: «Hoy con Y en lugar de X». En el selector, un grupo de radio: aceptarlo (por defecto: lo eligió el dueño) suma el recargo por unidad; rechazarlo lo deja sin nada.
  - Una adición que es un ingrediente agotado no se puede marcar, no cobra y no cuenta para el mínimo de su grupo; si un grupo obligatorio se queda sin opciones, el plato sale «No disponible hoy».
  - Sin `today` (o con una ficha guardada antes, sin los campos nuevos), todo funciona como antes: los campos nuevos son opcionales en TypeScript.
- **Pedido y mensaje.** El ítem guarda `swaps` («Pepino en lugar de Tomate», con su recargo) y `missing` («sin Tomate (no hay hoy)»), solo si hay algo, aparte de lo que la persona quitó: el restaurante distingue lo que pidió el cliente de lo que falta. El precio por unidad ya incluye los recargos; dos líneas que solo difieren en el reemplazo no se juntan. El carrito guardado (ADR 0024) los valida al leer y acepta los carritos viejos sin ellos. El mensaje los escribe en ES y EN.
- **Búsqueda por plato.** `Dish::orderableToday` también exige que no falte un ingrediente esencial; `DishSearch` lo trae para todos los platos de la respuesta en la misma consulta (`withEssentialSoldOut`). No hay que sincronizar el índice: su documento no lleva «agotado hoy» (ADR 0029).
- **Datos de ejemplo.** `IngredientSeeder` (en `DatabaseSeeder`, o solo con `db:seed --class=IngredientSeeder` sobre una base ya sembrada) da a cada restaurante ficticio ocho ingredientes «(prueba)», el tomate con reemplazo de pepino (+ $ 500), los vincula a los platos fuertes (fríjoles esencial en la bandeja, arroz en el arroz con pollo) y a las opciones de quitar y adiciones con el mismo nombre. Ninguno queda agotado: se marca desde el panel.
- **Arranque.** Nada nuevo en él: el módulo va en el chunk de la ficha y en el del selector, que ya eran diferidos; el presupuesto de 83 kB (`resources/js/map/bundle.test.ts`) no cambia.
- **Datos personales.** Ninguno nuevo (es contenido del restaurante): la política de datos no cambia.

## Consecuencias

- El dueño marca «Tomate agotado» una vez y todos sus platos se ajustan; a la medianoche vuelve solo, sin tareas programadas.
- El reemplazo es uno por ingrediente: no hay «elegí entre pepino o lechuga». Si hace falta, sería otra decisión.
- Un ingrediente que el plato no lleva y que solo nombra una adición no muestra «Hoy sin…»: solo esa adición queda sin poder elegirse.
- Las opciones existentes no apuntan a ningún ingrediente hasta que el dueño las vincule: el «Quitar» de antes sigue funcionando igual.
- La regla «del mismo restaurante» de las opciones vive en un disparador, no en una FK: hay que recordarlo si se reestructuran `options` u `option_groups`. Su función se crea con `CREATE OR REPLACE`, porque `migrate:fresh` borra tablas y no funciones.
- El total sigue siendo «estimado»: lo confirma el restaurante por WhatsApp.
