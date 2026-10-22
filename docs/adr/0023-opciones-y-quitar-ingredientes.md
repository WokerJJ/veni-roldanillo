# ADR 0023 · Opciones, adiciones y quitar ingredientes: un tipo de grupo, publicados por lista blanca y armados en el dispositivo

- Estado: aceptada
- Fecha: 2026-10-22
- Precisa: ADR 0009 (modelo de datos: `option_groups` y `options`), ADR 0018 (la ficha por lista blanca, que dejaba fuera las opciones) y ADR 0022 (el panel de abajo del celular y la regla del presupuesto del arranque).
- Afecta a: `option_groups` (columna `kind`), `App\Http\Resources\RestaurantProfile`, `RestaurantController`, `tests/contracts/restaurant.profile.json`, `resources/js/order/` y `resources/js/components/DishPicker.vue`, `MenuDishLine.vue` y `RestaurantMenu.vue`.

## Contexto

El pedido por WhatsApp (docs/02-producto.md) lleva, por plato, opciones obligatorias («proteína»), adiciones con precio, ingredientes a quitar («sin cebolla») y una nota libre. El modelo del ADR 0009 ya tenía `option_groups` (con `required`, `min_choices` y `max_choices`) y `options` (con `price_delta` y `available`), pero nada para quitar ingredientes. La ficha (ADR 0018) no publicaba ninguna opción: era lo que faltaba para armar un plato (#14). Mandarlo por WhatsApp y mostrar el carrito es de #15.

Había que decidir cómo se guarda «quitar», qué viaja al navegador, dónde se calcula el precio y se valida, dónde queda lo agregado mientras no hay carrito, y cómo se abre el selector sin pesar en el arranque.

## Alternativas

- **Una tabla `dish_ingredients`** (o una columna jsonb en `dishes`) para lo que se puede quitar. Es otro modelo, otra policy y otra pantalla en el panel del dueño para algo que se comporta como un grupo de opciones: una lista ordenada, traducible, que el dueño activa y desactiva.
- **Un grupo de opciones normal con un nombre convenido («Quitar»)**. Depende del texto que escriba el dueño, en dos idiomas, y no deja decir que quitar no cobra ni que nunca es obligatorio.
- **Ids de grupos y opciones en la ficha**, para que el pedido apunte al menú. El id de la base no viaja (ADR 0018) y el mensaje de WhatsApp escribe nombres: no hace falta.
- **Validar y calcular el precio en el servidor.** No hay pedido en el servidor (el pedido sale por WhatsApp, ADR 0004) y el total es «estimado»: lo confirma el restaurante. Repetir la regla en PHP no protege nada.
- **Guardar lo agregado en `localStorage` desde ya.** Sobreviviría a recargar, pero hasta #15 nadie puede verlo ni borrarlo: sería un dato de la persona escondido en su teléfono.
- **El selector con `defineAsyncComponent`, `<component :is>`, `v-model` y `.prevent`.** Cómodo, pero cada uno suma código al chunk de Vue, que es el del arranque: se midió +1,7 kB comprimidos, y el arranque ya estaba cerca de su presupuesto de 83 kB.

## Decisión

- **Quitar es un tipo de grupo.** `option_groups.kind` vale `choice` (lo de siempre) o `removal`, con valor por defecto `choice`: los grupos que existían no cambian, y en PostgreSQL agregar la columna no reescribe la tabla. Una restricción (`option_groups_kind_valid`) exige que un grupo de quitar no sea obligatorio (`min_choices = 0`, `required = false`). En PHP es `App\Enums\OptionGroupKind`. Las opciones de un grupo de quitar son los ingredientes.
- **Lista blanca.** Cada plato de la ficha lleva `groups`: `name`, `kind`, `min`, `max` y `options` (`name`, `price`), en el orden del restaurante (`position` y `id`) y en el idioma de la petición. No salen las opciones desactivadas (`available`) ni un grupo que se queda sin opciones. `max` no pasa de las opciones publicadas. En un grupo de quitar, `min` es 0, `max` es la cantidad de ingredientes y `price` es 0 aunque el dato diga otra cosa: quitar no cobra. `min` no se recorta: si un grupo obligatorio pide más opciones de las que quedan, el plato no se puede pedir y lo dice el dispositivo («No disponible hoy»).
- **Dos consultas más, fijas**: grupos y opciones de todos los platos, una por tabla. La ficha pasa de ocho a diez, tenga el menú los platos que tenga.
- **Precio y validación en funciones puras** (`resources/js/order/selection.ts`), sin Vue ni reloj: elegir respetando el tope (en un grupo de una sola opción, elegir otra suelta la anterior), el problema de cada grupo (`missing`, `too_many`, `unavailable`), el precio por unidad y por línea en pesos enteros, la cantidad entre 1 y 20, la nota sin espacios de más y hasta 140 caracteres, y el ítem del pedido. El ítem copia nombres y precios (plato, opciones elegidas con su grupo, ingredientes quitados, nota, cantidad): es lo que escribirá el mensaje de #15. Dos ítems iguales salvo la cantidad se juntan en una línea.
- **El pedido vive en memoria**, por restaurante (`useOrder(slug)`): sobrevive a navegar dentro de la app, no a recargar. Nada va al servidor ni al almacenamiento del dispositivo. Guardarlo en el dispositivo lo decide #15, junto con el carrito que lo muestra y lo vacía.
- **El selector es un `<dialog>` nativo con `showModal()`**: el navegador encierra el foco, deja inerte el resto y cierra con Escape; un toque en el fondo también cierra. En un celular vertical sale de abajo con las esquinas de arriba redondeadas, como el panel del mapa (ADR 0022); desde 768 px queda centrado. El foco entra al título (el lector de pantalla dice qué plato se abrió) y vuelve al plato al cerrar. Cada grupo es un `fieldset` con su `legend` y una pista («Obligatorio · Elegí 1», «Opcional · Hasta 2», «Tocá lo que no querés»); lo obligatorio de una sola opción es de radio y lo demás, casillas. Con el grupo lleno, las otras casillas se deshabilitan. Los errores aparecen después del primer intento de agregar: en cada grupo (enlazados con `aria-describedby`), anunciados en una región `alert`, y con el foco en la primera opción del primer grupo que falta. Todo lo tocable mide al menos 44 px. «Agregar» dice el precio de la línea, recalculado con cada toque.
- **En el menú**, cada plato que se puede pedir hoy es un `<button>` con `aria-haspopup="dialog"`. Uno agotado hoy o «No disponible hoy» no es botón. Al agregar se anuncia («Sancocho quedó en tu pedido») y el menú muestra «Tu pedido: N platos · total estimado».
- **Nada al arranque.** El selector se importa a mano al tocar el primer plato (un `shallowRef` con el componente), sin `defineAsyncComponent`, `<component :is>`, `v-model` ni `.prevent`; su CSS propio va en su chunk (`<style scoped>`) y no en utilidades nuevas de Tailwind. El arranque queda casi igual: medido con gzip -9, el JS de entrada pasó de 65,27 a 65,28 kB y el CSS de Tailwind, de 5,86 a 5,89 kB; el presupuesto de 83 kB (`resources/js/map/bundle.test.ts`) no cambia.

## Consecuencias

- El panel del dueño (#19) edita los ingredientes para quitar como otro grupo de opciones, con el tipo elegido al crearlo. Las policies no cambian: un grupo sigue siendo contenido del restaurante (`RestaurantContentPolicy`).
- Si el dueño cambia el menú mientras alguien arma el pedido, el ítem conserva lo que esa persona vio (nombres y precios). Es un total estimado; el restaurante confirma por WhatsApp. Reconciliar el pedido con el menú nuevo, si hace falta, es de #15.
- Recargar la página pierde lo agregado hasta que #15 decida guardarlo.
- La restricción vive en la base: un grupo de quitar obligatorio falla al guardarse, venga de donde venga.
- Que una opción sin recargo no muestre «+ $ 0» y que quitar no muestre precio son reglas de la vista; el dato ya llega en 0.
- Los restaurantes de ejemplo traen proteína obligatoria (una con recargo), adiciones (una desactivada, que no sale), ingredientes para quitar y la preparación del jugo, todo rotulado «(prueba)» y solo en restaurantes con `is_fictitious`.
