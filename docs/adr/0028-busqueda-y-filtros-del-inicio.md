# ADR 0028 · Búsqueda y filtros del inicio: en el dispositivo, en la dirección y con los almuerzos de hoy en la capa del mapa

- Estado: aceptada
- Fecha: 2026-10-28
- Precisa: ADR 0017 (el GeoJSON de los restaurantes: campos aditivos, caché de un minuto, «abierto ahora» en el dispositivo), ADR 0018 (el elegido en la dirección, `?r=slug`), ADR 0008 (la ubicación no sale del dispositivo) y ADR 0022 (la regla del presupuesto del arranque).
- Afecta a: `RestaurantFeature`, `pages/Home.vue`, `RestaurantList.vue`, `RestaurantsLayer.vue` y `docs/03-arquitectura.md` («Restaurantes en el mapa»).

## Contexto

El issue #12 pide en el inicio una búsqueda por nombre y categoría, filtros (abierto ahora, domicilio, nivel de precio y categoría) que se apliquen a la lista y al mapa a la vez, «Almuerzos de hoy» y «Sugiéreme algo». Había que decidir tres cosas:

- **Dónde se busca y se filtra.** El stack tiene Meilisearch para buscar (#17, por plato), y «abierto ahora» solo existe en el dispositivo (ADR 0017).
- **Dónde viajan los almuerzos del día.** `daily_menus` tiene un almuerzo por restaurante y fecha; el inicio necesita los de hoy, de los restaurantes publicados, con precio y enlace a la ficha.
- **Dónde vive el estado de los filtros.** El elegido ya va en la dirección (`?r=slug`) para que «atrás» desde la ficha vuelva al mismo mapa.

El arranque estaba en 82,4 kB de 83 (medido como `bundle.test.ts`), sin margen para sumar sin sacar algo antes (ADR 0022).

## Alternativas

- **Buscar con Meilisearch desde el inicio.** Una petición por búsqueda (con datos móviles, por cada pausa al teclear), un índice más que mantener al día con las fichas que se ocultan, y «abierto ahora» igual tendría que calcularse en el dispositivo después. Con los restaurantes de un municipio, que ya están en el dispositivo, no gana nada. Queda para la búsqueda por plato (#17), donde sí hace falta: los platos no viajan con el mapa.
- **Filtrar en el servidor** (`?open=1&delivery=1` en el GeoJSON). Rompe la caché de un minuto (una URL por combinación de filtros) y «abierto ahora» no existe en PHP (ADR 0017).
- **Un endpoint propio para los almuerzos** (`/api/daily-menus.json?lang=es`). Una petición más al abrir el inicio, con su propia caché, su contrato y su límite, y el cliente tendría que cruzarlo con los restaurantes para filtrar, ordenar y mostrar el nombre. Su única ventaja es no engordar el GeoJSON, y un almuerzo son unos 150 bytes por restaurante.
- **Los filtros en `localStorage`.** Sobreviven a cerrar la app, pero un enlace no los comparte, «atrás» desde una ficha no los devuelve si la persona los cambió en otra pestaña, y quedan guardados sin que nadie lo sepa. Descartada.
- **El código de filtrar y los botones nuevos en el arranque.** Filtrar necesita `openStatus.ts`, que ya baja aparte (ADR 0022). Habría pasado de 83 kB. Descartada.

## Decisión

- **Búsqueda y filtros en el dispositivo**, sobre los restaurantes que ya trajo la capa del mapa, en funciones puras (`resources/js/restaurants/finder.ts`) con la hora y el azar como parámetros, para que las pruebas sean deterministas. La búsqueda normaliza tildes, mayúsculas y espacios, y pide que cada palabra esté en el nombre o en alguna categoría, en cualquier orden. «Abierto ahora» usa `openStatus` (la misma lógica que el resumen y la lista) y deja fuera a los que no tienen horario; un nivel de precio es «hasta ese nivel» y deja fuera a los que no lo cargaron.
- **Lista y mapa a la vez**: la lista y la capa reciben los mismos filtros y filtran cada una con `finder.ts`; la capa solo le vuelve a dar datos a la fuente si cambió lo que se dibuja (con «abierto ahora» se recalcula cada medio minuto). El elegido se dibuja aunque no cumpla los filtros: su resumen está abierto.
- **El estado de los filtros va en la dirección**, como el elegido: `q`, `open=1`, `delivery=1`, `price=1..4` y `category=slug`, con `router.replace` en el dispositivo (sin pedir nada al servidor ni sumar entradas al historial), 300 ms después de dejar de teclear. Lo que no se entiende se ignora (`filterParams.ts`). Nunca la ubicación: las distancias de la lista siguen dentro del mapa (ADR 0020).
- **«Almuerzos de hoy» viajan en el GeoJSON** (cambio aditivo, ADR 0017): `lunch` con `date`, `description` (en el idioma de la URL) y `price`, o null, solo el de hoy en Colombia (`BusinessDay::today()`); y, de paso, `price_level` (1 a 4, o null) para el filtro de precio. Una consulta más (cinco en total, haya los restaurantes que haya). El cliente compara la fecha con el día de Colombia y deja de mostrar el almuerzo pasada la medianoche aunque su lista sea de ayer. La caché de un minuto y el `ETag` siguen igual: la respuesta cambia cuando se publica un almuerzo y a la medianoche.
- **Topes del almuerzo en la tabla**, porque viaja a todos los dispositivos con el mapa y todavía no hay un formulario que los ponga: `daily_menus` exige una descripción en español con algo escrito y de hasta 300 caracteres (`char_length(btrim(description_es)) BETWEEN 1 AND 300`), la de inglés opcional con el mismo tope, y un precio de 1 a 1.000.000 pesos (`CHECK` en la migración `2026_10_28_100000_add_limits_to_daily_menus_table`). Cuando el dueño pueda publicarlo desde el panel, su formulario valida lo mismo.
- **La sección muestra los almuerzos de los restaurantes que cumplen los filtros**, del más barato al más caro, con el precio y un enlace a la ficha. En la bienvenida, un botón «Almuerzos de hoy (N)» abre la lista con esa sección desplegada y con el foco.
- **«Sugiéreme algo»** (en la interfaz, «Sugerime algo», con el voseo de la marca) elige al azar entre los abiertos ahora que cumplen los filtros y lo elige como si lo hubieran tocado: la cámara va hasta él y abre su resumen. Si no hay abiertos, lo dice en una región de estado.
- **Peso.** Se aplicó la regla del ADR 0022 antes de sumar: el aviso sin señal de «Cómo llegar» pasó de `Home.vue` al resumen; filtrar, buscar, sortear, leer y escribir los filtros de la dirección, la sección de almuerzos y los botones nuevos de la bienvenida (`WelcomeActions.vue`) bajan con la lista. Al arranque llegan el estado de los filtros, su paso a la dirección y lo que carga lo demás: de 82,4 a 82,7 kB, sin subir el presupuesto. `bundle.test.ts` fija que nada de eso viaja con el arranque.

## Consecuencias

- Buscar y filtrar no hacen ninguna petición: funciona igual con mala señal una vez que llegó la lista.
- Mientras no baja la lista (con la PWA guardada, enseguida), la capa dibuja todos aunque la dirección traiga filtros, y la bienvenida no ofrece «Sugerime algo» ni los almuerzos; apenas baja, se aplican.
- La búsqueda es por nombre y categoría. Buscar «sancocho» no encuentra platos: eso es #17, con Meilisearch, y tendrá su propia decisión sobre cómo se combina con estos filtros.
- Si los restaurantes crecieran tanto que la lista dejara de viajar entera (ADR 0017), la búsqueda y los filtros tendrían que pasar al servidor, y «abierto ahora» con ellos.
- Los almuerzos de ejemplo se siembran aparte (`DailyMenuSeeder`), porque son de un día: en desarrollo, `php artisan db:seed --class=DailyMenuSeeder` publica los de hoy sin volver a sembrar todo.
- El dueño ya carga el nivel de precio en el perfil del panel, pero todavía no puede publicar el almuerzo del día desde el panel: hasta que exista, la sección solo muestra los que se carguen por otra vía (en desarrollo, los de ejemplo). Es trabajo aparte.
