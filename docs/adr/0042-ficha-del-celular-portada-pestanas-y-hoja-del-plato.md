# ADR 0042 · La ficha del celular: portada, pestañas fijas de la carta, el «+» y el detalle del plato como hoja

- Estado: aceptada
- Fecha: 2026-11-12
- Precisa: ADR 0038 (lo importante primero en el celular: «En esta ficha» pasa a ser las pestañas fijas; el computador no cambia), ADR 0023 (el selector del plato: ahora también se cierra deslizando y hay un atajo que no lo abre), ADR 0033 (ingredientes agotados: cuándo el atajo no se ofrece), ADR 0034 (la foto grande del plato pasa de 1:1 a 4:3 en el detalle), ADR 0036 (los chips de ingredientes: en la carta, en una línea con «+n») y ADR 0040 (movimiento solo sin «Reducir movimiento»).
- Afecta a: `pages/Restaurants/Show.vue`, `components/RestaurantMenu.vue`, `components/MenuDishLine.vue`, `components/IngredientChips.vue`, `components/DishPicker.vue`, `components/DishPhoto.vue`, `components/BottomSheet.vue`, `components/sheet.ts` y `lang/{es,en}.json`.

## Contexto

Cuarta etapa del rediseño del celular aprobado el 2026-11-06 (#141, M7 a M9). La ficha del celular era una columna de texto: el nombre, una fila de enlaces «En esta ficha» (#82) que quedaba arriba y se perdía al bajar, y una carta con la miniatura a la izquierda y los chips de ingredientes ocupando dos o tres líneas por plato. Para agregar un plato sin opciones había que abrir su detalle y tocar «Agregar». El detalle ya salía de abajo, pero con la foto cuadrada dentro de un margen y sin forma de cerrarlo con el gesto que la gente espera de una hoja.

El arranque tenía unos 1,8 kB de margen (`bundle.test.ts`). La ficha y el selector bajan aparte, así que el cambio va en sus chunks y en su CSS con alcance; al arranque solo llegan tres textos nuevos.

## Alternativas

- **Pestañas con `role="tablist"`.** No son pestañas de verdad: no cambian un panel, llevan a una parte de la misma página. Descartada: es una navegación con enlaces a anclas, y la sección que se lee se marca con `aria-current`.
- **Solo las secciones de la carta en las pestañas.** «En esta ficha» también llevaba al contacto y a los domicilios, que se consultan antes de pedir. Descartada: van al final de la fila.
- **Saber dónde va la lectura escuchando `scroll`.** Corre en cada cuadro y hay que medir cada sección. Descartada: un `IntersectionObserver` sobre una franja de arriba de la pantalla.
- **Quitar la sección «Promociones» cuando la portada ya muestra una.** La portada muestra una sola y sin la lista se pierden las demás. Descartada: la sección sigue, y el pie de la portada se oculta al lector (`aria-hidden`) para que el título no se lea dos veces.
- **El «+» dentro del botón del plato.** Un botón no puede llevar otro. Descartada: va fuera, encima de la esquina de la foto.
- **El «+» en todos los platos, con las opciones por defecto.** Agregaría un plato sin que la persona eligiera lo obligatorio, o aceptando o rechazando un reemplazo por ella (ADR 0033). Descartada.
- **Medir cuántos chips caben.** Exige medir cada fila y volver a medir al girar el teléfono. Descartada: un tope fijo de tres.
- **Deslizar la hoja desde cualquier parte.** Se pelea con el desplazamiento de las opciones. Descartada: solo desde la manija de arriba.
- **Encoger la foto cambiando su alto con JavaScript.** Mueve el contenido mientras se desplaza. Descartada: una animación atada al desplazamiento, solo donde el navegador la tiene.
- **Copiar en el selector el arrastre del panel del mapa.** Dos hojas con el mismo gesto y dos implementaciones se desajustan con el primer cambio. Descartada: el seguimiento del puntero (qué puntero es, la captura, cuánto bajó y a qué velocidad se suelta) vive en `components/sheet.ts` y lo usan las dos. Qué hace cada una con eso sigue siendo suyo: el panel cambia de altura y la hoja del plato se cierra. Los `@keyframes` repetidos de ADR 0040 siguen para la revisión final.

## Decisión

- **Portada (M7), solo en el celular.** Arriba de la ficha, en 16:9 y sin pasar de 14 rem: la primera promoción vigente que tenga imagen, con su título y hasta cuándo vale escritos sobre un degradado oscuro (texto blanco a más de 4,5:1 aun sobre una imagen blanca); la imagen es decorativa (`alt` vacío) y se pide con prioridad (`fetchpriority="high"`): es lo primero que se ve. Sin promoción con imagen, el fondo de la marca (ciruela) con el ícono de la primera categoría en mango. En computador no hay portada: la ficha sigue en dos columnas (ADR 0038).
- **Pestañas fijas (M7), en lugar de «En esta ficha».** Una fila que se desplaza de lado con las secciones de la carta, en su orden, y después «Ubicación y contacto» y «Domicilios» si los hay. Es un `nav` con nombre y enlaces de 44 px a anclas; cada destino lleva `tabindex="-1"` para que el foco vaya de verdad a la sección. Se queda arriba al bajar (`position: sticky`), debajo de la cabecera chica del celular (ADR 0041), que aparece fija al desplazarse, y sólida: el contenido no es de vidrio. Con una sola sección no sale.
  - La sección que se lee queda marcada con `aria-current`, con relleno de la marca y no solo color. Es la primera, en el orden de la página, que cruza una franja de arriba de la pantalla, hasta el 40 % de su alto. La franja empieza justo arriba de donde queda el título de una sección al saltar a ella (se mide del `scroll-padding-top` del documento y del `scroll-margin-top` de la sección): más arriba tocaría el final de la sección anterior y quedaría marcada la pestaña de antes; si ninguna la cruza, se queda la anterior. Al abrir está marcada la primera, y también si la sección marcada desaparece al volver a pedir la ficha: nunca queda marcada una pestaña que no existe. La pestaña marcada se centra en la fila.
  - Lo que mide la barra vive en una variable (`--ficha-tabs-offset`): todas las secciones a las que lleva saltan por debajo de ella. En computador, sin barra, el margen vuelve a 1 rem.
- **El plato en la carta (M8).** El texto a la izquierda (nombre, descripción, precio con «Agotado hoy» al lado) y la foto a la derecha. Los ingredientes, en una línea: tres y «+n» por el resto, que un lector de pantalla oye como «y n más». **Lo que hoy no hay y los reemplazos salen siempre**, aunque pasen del tope, tachados y dichos en texto como antes: el estado de un plato no se esconde detrás de un «+n». Con alguno de esos, la fila puede partirse en lugar de recortarse. Cada chip conserva su ancho: si no caben, la fila se recorta desvaneciéndose a la derecha (el lector los oye enteros) y el «+n», que va fuera de ella, siempre se ve. Angostarlos con puntos suspensivos dejaba el último en un trozo ilegible con nombres largos.
- **El «+» (M8).** Agrega una unidad sin abrir el detalle. Solo en los platos que no piden decidir nada: se pueden pedir hoy, no tienen grupos obligatorios y ningún ingrediente va hoy con reemplazo. En los demás, solo el detalle. Es un botón aparte, con su nombre («Agregar X al pedido»), un área de 44 px y un disco visible de 32 px sobre la esquina de la foto: esa esquina agrega y el resto de la fila abre el detalle. Cada toque se anuncia; con la línea en el máximo dice que ya está en el máximo.
- **El detalle como hoja (M9).** Sigue siendo el `<dialog>` modal de ADR 0023. La foto va de borde a borde, en 4:3 y sin pasar del 40 % del alto; donde el navegador anima con el desplazamiento (`animation-timeline: scroll()`), se encoge y se apaga al subir el contenido, y en los demás simplemente sube. «Cerrar» es un círculo sólido arriba a la derecha, antes que lo demás en el documento. «Agregar · $X» y la cantidad quedan fijos abajo, con el margen del indicador de inicio del sistema.
  - Se cierra con «Cerrar», con Escape, tocando el fondo y **deslizándola hacia abajo desde la manija**: más de 120 px, o un golpe rápido (0,6 px/ms con al menos 24 px), cierra; si no, vuelve a su lugar. La manija es solo para el dedo o el mouse y no es un control (`aria-hidden`): el teclado y el lector tienen «Cerrar» y Escape. Desde 768 px no hay manija.
- **Movimiento**: todo dentro de `prefers-reduced-motion: no-preference`, como fija ADR 0040.

## Consecuencias

- «En esta ficha» deja de existir; su clave de texto nombra ahora las pestañas («Carta y datos»). Las pestañas ya no llevan a «Promociones» ni a «Menú» como un todo.
- La foto grande del plato se recorta a 4:3 en el detalle (se sigue viendo entera al ampliarla).
- La esquina de la foto de un plato con «+» ya no abre el detalle.
- Tres textos nuevos en `lang/` («y n más», «Agregar X al pedido» y el aviso del máximo). El presupuesto del arranque sigue en verde.
- En navegadores sin `animation-timeline` la foto no se encoge; sin `IntersectionObserver`, queda marcada la primera pestaña y no cambia al bajar. En los dos casos todo lo demás funciona.
- El panel del mapa (`BottomSheet`) cambia por dentro: usa el mismo seguimiento del arrastre que la hoja del plato. Su comportamiento y sus pruebas no cambian.
- Cuando la fila de chips se recorta, el «+n» cuenta los que pasan del tope de tres, no los que el recorte dejó fuera de la vista.
- La ficha se miró en un navegador a 390 y 320 px, en claro y oscuro, con los datos de ejemplo: de ahí salieron las pestañas bajo la cabecera chica, el recorte de los chips y dónde empieza la franja. Los datos de ejemplo no traen fotos de platos ni imágenes de promoción, y ese navegador no entregaba los avisos de `IntersectionObserver`: quedan por ver en un celular real la portada con imagen, la foto del detalle y la pestaña marcada al desplazarse.
