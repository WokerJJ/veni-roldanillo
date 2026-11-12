# ADR 0043 · El pedido en tres pasos: Tu pedido, Entrega y Revisar y enviar, con los pasos montados y «Enviar» solo en el último

- Estado: aceptada
- Fecha: 2026-11-12
- Precisa: ADR 0024 (el carrito: lo que decía del pie fijo con el total y «Enviar», y de cuándo se marcan los errores), ADR 0040 (el tope de peso del arranque y el movimiento solo sin «Reducir movimiento») y ADR 0042 (la hoja del plato; el pedido es la otra hoja del celular).
- Afecta a: `resources/js/components/OrderCart.vue` y `lang/{es,en}.json`.

## Contexto

Quinta etapa del rediseño del celular aprobado el 2026-11-06 (#142, M10). El carrito era una sola hoja larga: las líneas, el formulario de entrega y pago, y abajo un pie fijo con el total y «Enviar pedido por WhatsApp». En un celular el pie ocupaba un cuarto de la altura y dejaba poco para los campos; «Enviar» estaba a la vista antes de haber dicho cómo se recibe y cómo se paga, y el mensaje que iba a salir solo se veía al abrir WhatsApp.

El ADR 0024 fijó dos cosas que esta etapa cambia: que los errores del formulario aparecen «después del primer intento de enviar», y que el total y «Enviar» quedan fijos al pie. El mensaje de WhatsApp, las reglas de producto 1 y 2 (WhatsApp sin pagos, «Total estimado»; direcciones y ubicación solo en el dispositivo) y la libreta de direcciones no cambian.

## Alternativas

- **Tres pantallas o rutas distintas.** Cada una con su dirección y su historial. Descartada: es el mismo diálogo, no hay a dónde «volver» salvo el paso anterior, y una dirección por paso dejaría el pedido en la barra del navegador.
- **Mostrar solo el paso que toca con `v-if`.** Se pierde lo escrito al ir y volver. Descartada.
- **`v-show`.** Conserva lo escrito, pero su directiva suma código de Vue al chunk del arranque (`bundle.test.ts`, ADR 0040). Descartada: el atributo `hidden`, que es `display: none` para la vista, el lector y el teclado, sin ayudantes de Vue.
- **Pasos que se tocan en la barra.** Saltar de «Tu pedido» a «Revisar» sin pasar por «Entrega» se salta la validación. Descartada: la barra solo dice dónde se está; se avanza con «Continuar» y se vuelve con «Atrás».
- **Mostrar el desglose del total en todos los pasos.** Le quita altura a los campos justo donde se escriben. Descartada: en «Entrega» queda una sola línea con el total (ver abajo).

## Decisión

- **Tres pasos en el mismo `<dialog>`**: «Tu pedido» (las líneas, cambiar cantidades, vaciar), «Entrega» (cómo se recibe, dónde y cómo se paga) y «Revisar y enviar» (el mensaje tal como va a salir y «Enviar pedido por WhatsApp»). Una barra de progreso de tres tramos dice en cuál se está (`aria-current="step"`) y no es interactiva. Sin WhatsApp en el restaurante o con el pedido vacío no hay pasos.
- **Los tres pasos quedan montados** y los que no tocan llevan `hidden`: lo escrito no se pierde al ir y volver, y ni el foco ni el lector entran a lo que no se ve. Ningún contenedor con `hidden` lleva una clase que fije `display`.
- **«Continuar» no avanza si falta algo del paso**: con líneas que ya no valen, vuelve a «Tu pedido» y lleva el foco a «Quitar»; con la entrega o el pago incompletos, marca cada campo, lo anuncia y lleva el foco al primero. Los errores aparecen al tocar «Continuar», no al «Enviar» (enmienda del 0024). Al cambiar de paso el foco va al título, que dice el paso, y se anuncia («Paso 2 de 3: Entrega.»).
- **«Enviar por WhatsApp» solo existe a la vista en el último paso**, con el total estimado. Sigue siendo un enlace real a `wa.me` solo con el pedido completo; si el pedido deja de valer con el último paso abierto (cambió el día, el efectivo ya no alcanza), el botón vuelve al paso que toca y lo dice. El mensaje de «Así va tu mensaje» y el del enlace salen del mismo texto: no pueden diferir.
- **El pie** es una columna de botones fuera de lo que se desplaza: nunca queda encima de un campo. En «Tu pedido» y en «Revisar y enviar» lleva el total y su nota; en «Entrega» solo una línea con el «Total estimado» (con «+ domicilio» mientras no se conoce) y los botones, para no quitarle altura a los campos y para que se escriba «¿Con cuánto pagás?» sabiendo el total (enmienda del 0024).
- **Doble toque.** Mientras cambia el paso, «Continuar» y «Atrás» no atienden otro toque: el segundo toque de un doble toque no salta un paso ni marca errores de un formulario que la persona no vio.
- **Si el pedido se vacía** (vence a las 24 h o se borra en otra pestaña) o el restaurante deja de recibir pedidos por WhatsApp con un paso 2 o 3 abierto, el diálogo vuelve a «Tu pedido»; la pregunta «¿Vaciás todo el pedido?» se cierra al cambiar de paso.
- **El recuadro de foco** sale solo con el teclado (`:focus-visible`): el título, que recibe el foco al cambiar de paso, no lo dibuja al tocar.
- **Barra**: el tramo hecho y el actual en el color de la marca y el pendiente más delgado y apagado (3:1 en claro y oscuro): el estado no depende solo del color. Sólida, como el resto del contenido; el cambio de color, dentro de `prefers-reduced-motion: no-preference`.

## Consecuencias

- Siete textos nuevos en `lang/` (`order.steps.*`), con paridad ES/EN. El arranque no cambia: el carrito baja aparte, al tocar «Ver tu pedido».
- Enviar un pedido pide ahora tocar dos veces «Continuar»; a cambio se ve el mensaje completo antes de abrir WhatsApp.
- Con `hidden`, las pruebas de jsdom/happy-dom ven los elementos ocultos (no aplican `display: none`): las del flujo pasan por «Continuar» (`reachReview`) y el clic en «Enviar» exige que el enlace no esté dentro de un `[hidden]`.
- Queda pendiente, por decisión: el pie del último paso mide unos 240 px y en un celular de 320 × 568 deja poca altura al mensaje (se puede mover «Atrás» junto a «Enviar»); el lector oye el paso dos veces (por el foco y por el anuncio); el título «Entrega» seguido del subtítulo «Entrega y pago»; y mirar el carrito en un celular real a 320 y 390 px, en claro y oscuro.
