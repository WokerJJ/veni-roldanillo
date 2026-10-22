# ADR 0022 · El panel de abajo del celular: tres alturas, una manija propia y el resumen y la lista fuera del arranque

- Estado: aceptada
- Fecha: 2026-10-21
- Precisa: ADR 0016 (capas propias: el elegido se dibuja aparte, de forma aditiva), ADR 0019 (el margen del panel en la cámara), ADR 0020 (la regla del presupuesto del arranque) y ADR 0008 (la ubicación no sale del dispositivo).
- Afecta a: `resources/js/components/BottomSheet.vue`, `sheet.ts`, `pages/Home.vue`, `RestaurantsLayer.vue`, `RestaurantList.vue`, `RouteDirections.vue` y `layouts/AppLayout.vue`.

## Contexto

La evaluación heurística del 2026-10-21 (Nielsen y WCAG 2.2) midió en Chrome que, a 390 px, la lista y la ruta tapaban el 74 % del mapa, con un panel de una sola altura. Con la ruta abierta se apilaban dos tarjetas con dos botones de cerrar y el tiempo repetido, y el restaurante de destino podía quedar dentro de un grupo «2». El issue #81 pide el patrón de las apps de mapas: un panel de abajo que se achica.

El arranque estaba en 82,9 kB de 83, y el ADR 0020 fijó qué hacer antes de subir el presupuesto: sacar del arranque lo de «Cómo llegar» a un chunk que baje con el resumen.

## Alternativas

- **Una librería de paneles de abajo** (vaul-vue y parecidas). Traen dependencias de Radix o de animación y pesan más que el arranque que queda libre. Descartada.
- **Scroll snap de CSS** (el panel dentro de un contenedor que se desplaza). Sin JavaScript, pero el contenedor tapa el mapa entero y se lleva sus gestos: el mapa de arriba deja de poder moverse. Descartada.
- **Altura fija según lo que se muestra, sin manija.** Más simple, pero no deja ver más mapa ni más lista a quien lo quiera. Descartada.
- **Subir el presupuesto a 84 kB.** El ADR 0020 pide primero sacar del arranque lo que no hace falta al abrir. Descartada.

## Decisión

- **En un celular vertical, tres alturas máximas**: asomado (7,5 rem, unos 120 px: la manija y una línea), a media altura (50 % del mapa) y completo (el mapa menos la franja de la atribución y las 10 rem de arriba, donde están los botones de zoom y «¿Dónde estoy?», que así nunca quedan tapados). Son un tope (`max-height`): si lo de adentro es más corto, como la ruta compacta, el panel se ajusta y no tapa de más.
- **Abajo o al costado lo decide el alto, no solo el ancho**: el panel va abajo (variante `sheet:` de `app.css`) por debajo de 480 px, y entre 480 y 767 px solo si la ventana tiene al menos 32 rem (512 px) de alto; si no (un celular acostado, una tableta chica acostada) y desde 768 px, queda el panel lateral de siempre (`side:`). Calculado con estas alturas en un iPhone SE acostado (667 × 375): el mapa mide 324 px bajo la cabecera de 51, la media altura tapaba 162 y el completo quedaba en 128 px, casi lo mismo que el asomado: el panel de abajo no tenía para dónde crecer. A 512 px de alto el completo ya llega a unos 265 px.
- **Cada vista toma su altura**: la bienvenida con restaurantes, asomado; la lista, el resumen, la ruta y los avisos que piden leerse, a media altura. Desde ahí manda quien usa la app, hasta que el panel muestra otra cosa.
- **La manija es un `<button>` de 96 × 44 px** con un nombre fijo («Cambiar el alto del panel»), propio, con Pointer Events y `touch-action: none`: arrastrar sigue al dedo sin animar; al soltar queda en la altura más cercana, salvo un gesto rápido (desde 0,5 px/ms) que sigue en su dirección. Un movimiento de menos de 6 px es un toque. Con el mouse, al soltar un arrastre llega un clic que no cuenta; con el dedo ese clic no llega, y el toque siguiente sí cuenta; Enter siempre. Si la manija pierde el puntero a mitad del arrastre (`pointercancel` o `lostpointercapture`, por ejemplo al girar el teléfono y pasar al panel lateral), el arrastre termina. Tocarla o Enter sube un escalón, y desde el completo vuelve a asomado; las flechas suben y bajan, Inicio y Fin van a los extremos. Cada cambio de altura hecho con la manija se anuncia en una región viva; si la altura no cambia (Abajo estando asomado), no se anuncia nada. La transición de alto respeta `prefers-reduced-motion`.
- **El mapa de arriba sigue siendo del mapa**: el panel no cubre más que su alto. La cámara usa el alto real del panel: `showPoint` centra el restaurante en lo que queda a la vista con `offset` (no con `padding`, que MapLibre dejaría puesto: ADR 0019), y el encuadre de la ruta y de la ubicación ya medían el panel al pedirlo. Como el panel cambia de alto después (su transición de 200 ms), el panel avisa cuando terminó de moverse (al acabar la transición, o enseguida con `prefers-reduced-motion` o sin transición) y recién ahí la cámara vuelve a mirar: al elegido desde la lista o desde la dirección (`?r=slug`) lo centra de nuevo con el alto nuevo, y al tocado en el mapa lo mueve solo si quedó debajo del panel o pegado a un borde (`showPoint` con `ifHidden`). Una vez por elegido: si después alguien mueve el panel con la manija, la cámara no lo sigue.
- **Ruta compacta**: el resumen se reduce a una línea (el nombre y un solo botón de cerrar, que oculta la ruta y devuelve el resumen); a la vista, a pie y en carro con duración y distancia, y el estado si no está lista. Con la ruta lista el estado solo se anuncia: el tiempo no se repite. La estimación, Google Maps / Waze y la atribución ODbL van en «Más opciones», un `<details>` nativo que se abre solo cuando la ruta no sale y la salida es otra app.
- **El elegido nunca se agrupa**: sale de la fuente agrupada y se dibuja con su halo, su punto y su ícono en capas al final del grupo `restaurants`, encima de los grupos. Es aditivo al contrato del ADR 0016: mismo grupo, mismo prefijo, una capa tocable más.
- **Lista compacta**: nombre y una línea con el estado y, con «¿Dónde estoy?» encendido, la distancia en línea recta; primero los abiertos ahora y, entre ellos, los más cerca. El orden se fija al abrirla y, con «¿Dónde estoy?», con la primera distancia: mientras está abierta nada cambia de lugar bajo el dedo, solo el texto de la distancia. Si todos son de ejemplo, el rótulo va una vez arriba. Las distancias las calcula `RestaurantDistances.vue` dentro de `<MapView>` con la suscripción en memoria del ADR 0020: de ahí solo salen metros redondeados a 10, nunca la posición, y no pide la ubicación.
- **Cabecera de 51 px en el celular**, y con el mapa, a lo ancho con el mismo margen de 16 px que el panel. El enlace de la atribución tiene 24 px de alto (WCAG 2.5.8).
- **Peso.** Se aplicó la regla del ADR 0020 antes de sumar nada: el resumen (con «Cómo llegar» y su aviso sin señal) y la lista (con sus distancias, el estado de cada horario y el formato de distancias) bajan con `import()` apenas monta el inicio, no con el arranque. El arranque bajó de 82,9 a 80,4 kB; con el panel y lo demás quedó en 82,5, y con lo que el panel avisa al terminar de moverse, el aviso de «Reintentar» y la cámara que espera al panel, en 82,98: dentro de los 83, pero sin margen. Lo próximo que sume al arranque tiene que sacar algo antes (ADR 0020). `bundle.test.ts` fija que nada de eso viaja con el arranque.

## Consecuencias

- La primera vez, sin la PWA guardada y con mala señal, tocar un restaurante antes de que bajen el resumen y la lista deja la bienvenida un momento. Si no bajan, el panel lo dice con «Reintentar», y también se vuelven a pedir con el siguiente toque o con «Ver la lista».
- Con la lista a media altura el mapa tapado quedó en 50–51 % a 360 y 390 px (antes 71–74 %), y con la ruta en 26–28 % (antes 71–74 %). Medido en Chrome el 2026-10-21 con la pila de desarrollo.
- Tocar un restaurante en el mapa no mueve la cámara mientras sigue a la vista; si el panel, al subir, lo tapa, la cámara lo saca de debajo cuando el panel termina de moverse.
- Con la franja de los botones libre, el panel completo deja 10 rem de mapa arriba aunque la lista sea larga.
- Entre 480 y 767 px de ancho el panel cambia de abajo al costado al girar el teléfono; un arrastre a medio hacer termina ahí.
- Las alturas viven en `sheet.ts` (y la de asomado, en rem): cambiarlas es cambiar ese archivo y sus pruebas.
