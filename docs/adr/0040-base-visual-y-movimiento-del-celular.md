# ADR 0040 · La base visual y el movimiento del celular: radios de la marca, un resorte solo sin «Reducir movimiento» y la lista a la altura completa

- Estado: aceptada
- Fecha: 2026-11-07
- Precisa: ADR 0022 (las alturas del panel de abajo: la lista pasa de media altura a completa, y su transición), ADR 0028 («Sugerime algo» sin abiertos y la lista que abre la dirección), ADR 0020 (la regla del presupuesto del arranque) y ADR 0037 y 0038 (el computador no cambia de diseño).
- Afecta a: `resources/css/app.css`, `components/BottomSheet.vue`, `pages/Home.vue`, `components/WelcomeActions.vue`, `components/RestaurantList.vue`, `components/RestaurantSummary.vue`, `components/DishResults.vue`, `components/DishPicker.vue`, `components/OrderCart.vue`, `components/SavedOnDevice.vue`, `components/DishPhoto.vue`, `components/DishPhotoViewer.vue`, `components/RestaurantPromotions.vue`, `components/MenuDishLine.vue`, `pages/Restaurants/Show.vue`, `components/pill.ts`, `restaurants/finder.ts`, `restaurants/useFinder.ts`, `restaurants/listParams.ts`, `restaurants/statusText.ts`, `lang/{es,en}.json` y sus pruebas (`components/mobileBase.test.ts`, nueva).

## Contexto

El 2026-11-06 se aprobó un rediseño del celular en siete etapas, con el estilo de iOS 26: vidrio solo en los controles y la navegación, contenido sólido, contraste medido y respeto a «Reducir transparencia» y «Reducir movimiento». Esta es la primera (#138): la base visual, el movimiento y cinco arreglos que salieron de recorrer la app en un iPhone 15 (393 × 852) emulado con 40 restaurantes.

- **Radios mezclados.** Las hojas de los diálogos tenían 16 px, el panel del mapa 14, las fotos 8 y 12, la columna de la ficha 16. La marca ya define tres (`--veni-radius-sm/md/lg`: 10, 14 y 22 px) y solo se usaban dos.
- **Sin movimiento propio.** El panel cambiaba de alto en 200 ms con la curva por defecto, los diálogos aparecían de golpe y tocar un botón no respondía hasta soltarlo. La lista que esperaba a los restaurantes decía «Cargando…».
- **A1.** «Sugerime algo» con todo cerrado escribía «Ahora no hay ningún restaurante abierto» en una región de estado que, con el panel asomado (120 px), quedaba debajo del borde: el lector la oía, en pantalla no se veía nada.
- **A2.** «Ver la lista» abría a media altura: entraban dos o tres filas.
- **A3.** Las filas de «Tus favoritos» no llevaban la flecha «›» a la ficha, y las de abajo sí.
- **A4.** El «−» de cantidad desactivado (opacidad 0,4) quedaba en 2,5:1 el signo y casi invisible el borde.
- **A5.** Al tocar «Buscar dónde lo sirven» en la guía de platos, el inicio quedaba con el mapa sin marcadores y el panel asomado diciendo «Cargando…». La causa: la lista que pide la dirección (`/?q=sancocho`) la abría la bienvenida (`WelcomeActions`), que se monta recién cuando llegaron los restaurantes **y** su chunk. Mientras tanto no había nada que mostrar, y con mala señal eso eran segundos. En el servidor de desarrollo (sin Octane) la visita de Inertia misma tarda unos 1,4 s, que se ven en la guía con la barra de progreso; eso no cambia aquí.

El arranque medía 81,205 kB de 83.

## Alternativas

- **Una escala de radios propia** (8, 12, 16, 24). Ya hay una en la marca: se usa esa.
- **Tres tamaños de texto nuevos para las listas** (17, 15 y 13 px, los de iOS). Serían utilidades nuevas de Tailwind, cuyo CSS baja con el arranque, y 13 px queda cerca del mínimo de 12 que mide la revisión. Descartada: la escala son los tres que ya se usan (`text-base`, `text-sm`, `text-xs`).
- **Un resorte con `linear()`** (una curva con varios puntos). Más fiel a un resorte de verdad, pero son cientos de bytes en el CSS del arranque. Descartada: un `cubic-bezier` que se pasa un poco de 1 (`0.3, 1.3, 0.5, 1`) da el rebote leve.
- **Una librería de animación** (motion-v, GSAP). Pesa más que el margen del arranque. Descartada.
- **La respuesta al tocar con una utilidad en cada botón** (`active:scale-97`). Una clase más en decenas de botones, algunos en el arranque. Descartada: una regla en la capa base de `app.css` (`@layer base`, para que una utilidad de Tailwind le gane) para botones, enlaces y `summary`, que además lleva el cambio de color al pasar por encima; por eso sale la utilidad `transition-colors` de todos los botones (con «Reducir movimiento» la capa base ya dejaba todas las transiciones en 0,01 ms).
- **A5: abrir la lista solo cuando llegue todo, pero más rápido.** No depende de nosotros: lo que tarda es la red. Descartada: la lista se abre enseguida, con siluetas.
- **A5: leer los filtros en el arranque con `filterParams.ts`.** Suma el módulo al arranque. Descartada: el inicio mira la dirección con `listParams.ts`, una función de unas líneas sin imports que la lee como `filtersFromUrl` y `hasFilters` (el primer valor de cada parámetro, decodificado, con los mismos topes y el mismo formato de categoría); una prueba de contrato en `filterParams.test.ts` comprueba que digan lo mismo. Los filtros de verdad los sigue leyendo `finder.ts`, que baja con la lista. Una expresión regular con los nombres de los parámetros era más corta (0,106 kB menos), pero no decodifica ni toma el primer valor: abría la lista con `price=2`, `open=10` o `q=+`, que la lista ignora.

## Decisión

- **Radios**, con los tokens de la marca: las hojas (el panel de abajo y los diálogos del plato, el pedido y lo guardado) 22 px (`--veni-radius-lg`, `rounded-veni-lg`); las tarjetas (las fotos grandes, las promociones, la columna de la ficha en computador, el panel sin mapa) 14 px (`md`); las filas, los campos y las miniaturas 10 px (`sm`); los botones, en píldora. Ningún componente escribe un radio a mano (una prueba lo comprueba).
- **Espacios en múltiplos de 4 px**: en lo que se tocó, los 2 y 6 px (`0.5`, `1.5`, `2.5` de Tailwind) pasan a 4 y 8.
- **Tres tamaños de texto en las listas**: el nombre en `text-base` (16 px), lo de abajo en `text-sm` (14) y lo más chico en `text-xs` (12).
- **Movimiento, todo dentro de `@media (prefers-reduced-motion: no-preference)`** (una prueba lee el CSS compilado de `app.css` y de cada hoja y falla si algo se mueve afuera):
  - El panel de abajo cambia de alto con el resorte (`--veni-ease-spring`, 320 ms), en la capa base de `app.css` y con la variante `sheet` (`@variant sheet`, sin copiar su media query), no con utilidades. Mientras se arrastra lleva `data-dragging` y sigue al dedo sin animar. `settled()` espera hasta 600 ms (antes 400) por si la transición no avisa.
  - Los diálogos del plato, el pedido y lo guardado entran desde abajo en 320 ms (en una pantalla ancha, centrados: 2 rem y apareciendo) y su fondo aparece en 200 ms. Con una curva sin rebote, `cubic-bezier(0.2, 0.9, 0.3, 1)`: animan `translate`, y el resorte, que pasa de 1, los subiría de más y dejaría ver una franja abajo. El resorte queda para el panel (que anima su alto) y la respuesta al tocar. Sus `@keyframes` se repiten en los tres componentes (con nombres propios, porque Vue los aísla): se acepta por ahora y se unifican en la revisión final del rediseño, junto con `useModalDialog`.
  - Tocar un botón, un enlace o un `summary` lo achica a 0,97 mientras se presiona y vuelve con el resorte, desde la capa base (una utilidad propia del botón le gana). La manija del panel y los botones desactivados no.
  - Siluetas de carga (`.veni-skeleton`): filas grises que laten despacio, ocultas al lector, en la lista que espera a los restaurantes y en «Platos» mientras busca. Con «Reducir movimiento», quietas.
- **A1.** Sin abiertos, «Sugerime algo» dice cuál abre primero y cuándo («Ahora no hay ningún restaurante abierto. El que abre primero es …, abre a las 6:00 p. m.», una frase entera por idioma, con o sin filtros, y solo la parte de cuándo abre; `firstToOpen` en `finder.ts`), ofrece «Ver …» para elegirlo y, en la bienvenida, sube el panel de asomado a media altura (`expand`) para que el aviso se vea. Si con el reloj abre alguno de los que cumplen los filtros, el aviso se va: no queda diciendo que no hay abiertos.
- **A2.** La lista abre a la altura completa (precisa el ADR 0022, que la abría a media altura). El resumen, la ruta y los avisos siguen a media altura.
- **A3.** Cada favorito lleva la flecha a su ficha, con el nombre del restaurante en el enlace, como las demás filas.
- **A4.** El «−» y el «+» desactivados no usan opacidad: el signo y el borde llevan el texto mezclado con el fondo al 55 % (3,8:1 en claro y 5,8:1 en oscuro, WCAG 1.4.11) y el borde va punteado, que no depende solo del color.
- **A5.** Si la dirección trae una búsqueda o filtros, el inicio abre la lista al montarse, a la altura completa, con cinco filas de siluetas y «Cargando los restaurantes…» en una región de estado. Llegan los restaurantes y la lista y quedan las filas; si no llegan, el aviso con «Reintentar», a media altura. La bienvenida ya no la vuelve a abrir al cerrarla (`opensListFromUrl` se consume al bajar la lista, también si la cerraron antes de que bajara). Con la búsqueda en la dirección y ningún restaurante, queda el aviso a media altura.
- **El computador** no cambia de diseño: la barra lateral y la ficha en dos columnas siguen como en los ADR 0037 y 0038. Le llegan los radios unificados (la columna de la ficha pasa de 16 a 14 px), la respuesta al tocar y los espacios en múltiplos de 4.
- **Peso.** El arranque pasó de **81,205 kB a 81,518 kB** (+0,313). Hecho primero, medía 81,747: se sacaron del arranque los tokens de radio con nombre propio (se usan los de la marca), los tamaños de las siluetas en utilidades (van en su regla) y la utilidad `transition-colors` de los 18 botones que la usaban (la regla de la respuesta al tocar ya lleva esa transición): 81,531. La prueba nueva del CSS sumó 0,18 kB sin viajar, porque Tailwind escaneaba también las pruebas y una palabra como `transition` en una de ellas generaba su utilidad: `app.css` las deja fuera (`@source not '../js/**/*.test.ts'`), y eso quitó además 0,013 kB que ya sumaban las pruebas de antes. Lo que queda es CSS que se ve al abrir (el resorte del panel, la respuesta al tocar y las siluetas, unos 0,25 kB) y la lista que abre la dirección en `Home.vue`. No había otra cosa que sacar sin mover partes del primer pintado: queda registrado aquí, sin subir el presupuesto de 83 kB. Con las correcciones de la revisión, **81,684 kB** (+0,166): 0,106 de `listParams.ts` en lugar de la expresión regular, y lo demás, la capa base y la variante del panel en el CSS.
- **Presupuesto de las etapas que faltan.** Quedan 1,316 kB hasta 83. Para que la primera que llegue no se lleve el margen de las otras, cada una tiene su parte en el arranque (lo que baja aparte no cuenta):

  | Etapa | Qué | Tope en el arranque |
  | --- | --- | --- |
  | #139 | Navegación | 0,45 kB |
  | #140 | Mapa (controles con vidrio) | 0,2 kB |
  | #141 | Ficha | 0 (baja aparte) |
  | #142 | Pedido | 0 (baja aparte) |
  | #143 | Guía de platos | 0 (baja aparte) |
  | #144 | Sin señal | 0,3 kB |

  Suman 0,95 kB y quedan unos 0,37 de reserva para arreglos. Si una etapa se pasa de su tope, primero se difiere lo que no se ve al abrir (CSS con alcance en el componente que baja aparte, o el código a un chunk con `import()`); si aun así no alcanza, un ADR nuevo dice qué se sumó y sube el tope (o el límite de 83), sin tomar en silencio la parte de otra etapa.

## Consecuencias

- Abrir un enlace de la guía de platos muestra enseguida la lista con siluetas, aunque el mapa y los restaurantes tarden. La barra de progreso de Inertia en la guía (la visita al servidor) sigue: con Octane, en producción, es mucho más corta que en desarrollo.
- Con «Reducir movimiento» no hay ninguna animación nueva: el panel cambia de alto de golpe, los diálogos aparecen y los botones no se achican.
- Cualquier botón o enlace nuevo recibe la respuesta al tocar sin hacer nada; uno que no la quiera (como la manija) se excluye en la regla de `app.css`, y uno que necesite otra transición o escala la pone con una utilidad, que gana.
- Las alturas del panel siguen en `sheet.ts`; cuál toma cada vista, en `Home.vue` (`panelView`).
- Quedan para las etapas siguientes del rediseño (#139 en adelante): la navegación, el vidrio en los controles y lo demás de la propuesta.
