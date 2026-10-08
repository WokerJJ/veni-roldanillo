# ADR 0017 · Restaurantes en el mapa: GeoJSON público con caché corta y «abierto ahora» calculado en el dispositivo

- Estado: aceptada
- Fecha: 2026-10-07
- Precisa: ADR 0007 (los restaurantes son una capa GeoJSON que sirve la app), ADR 0009 (horario semanal y horarios especiales), ADR 0010 (el idioma lo resuelve el servidor) y ADR 0015 (qué guarda el service worker).
- Afecta a: `docs/03-arquitectura.md` («Mapa autohospedado» y «App instalable y caché»).

## Contexto

El mapa del inicio muestra los restaurantes publicados (#9) y, al tocar uno, un resumen con su estado: «Abierto ahora» o «Cerrado · abre a las…». La lista sale de la base de la app como GeoJSON (ADR 0007). Había que decidir cuatro cosas que se condicionan entre sí:

- **Qué viaja.** El mapa es público: lo que se mande queda a la vista de cualquiera y en cachés.
- **Cómo se guarda.** La regla 8 pide que la app sirva con mala señal, pero una ficha que se oculta (un retiro a pedido del dueño) tiene que dejar de verse pronto.
- **El idioma.** Los nombres de las categorías están en español e inglés, y el idioma de una página lo decide el servidor con la cookie, la cuenta o `Accept-Language` (ADR 0010).
- **Dónde se calcula «abierto ahora».** Es el único dato de la lista que cambia con el reloj.

## Alternativas

- **«Abierto ahora» calculado en el servidor**, con un campo `open` y la hora del próximo cambio. Deja la lógica en PHP, junto a los datos, y serviría también a un filtro en el servidor. Pero la respuesta deja de ser cacheable sin trampa: un «abierto» guardado sigue diciendo «abierto» después del cierre, y la página del mapa puede quedar abierta horas. Para compensarlo harían falta una caché de segundos (más peticiones con datos móviles), que el cliente comparara igual las horas de cambio, y volver a pedir la lista cada vez que algún restaurante abre o cierra.
- **El idioma por `Vary: Cookie, Accept-Language`**, como las páginas. Una caché compartida guardaría una copia por cada combinación de cookies (en la práctica, ninguna) y la respuesta dependería de la sesión.
- **Los dos idiomas en la misma respuesta.** Una sola URL, pero el cliente tendría que repetir la regla de «si falta el inglés, español» (hoy está en un solo lugar, `HasTranslatableFields`) y la respuesta crecería con cada campo traducible que se sume.
- **Guardar la lista en el service worker** (network first con respaldo, o stale-while-revalidate). Sin red la app igual no abre: el HTML no se guarda (ADR 0015) y toda entrada al inicio pasa antes por el servidor. Con red lenta mostraría una copia sin que nadie sepa de cuándo es, y una ficha oculta podría reaparecer hasta que venciera esa copia.
- **Una ruta sin `/api`, en `routes/web.php` sin el grupo `web`**, como el manifest. Sirve, pero los errores (422, 429) saldrían como páginas HTML salvo que quien pide mande `Accept`; bajo `/api` la app ya los responde como JSON.

## Decisión

- **`GET /api/restaurants.geojson`**: una `FeatureCollection` (RFC 7946) con los restaurantes publicados (los estados `unclaimed` y `claimed`, nombrados uno por uno: un estado nuevo no sale hasta que se sume a esa lista), en `routes/api.php`: sin sesión, sin cookies y sin el idioma de la petición. La arman `RestaurantGeoJsonController` (cuatro consultas, haya los restaurantes que haya), `RestaurantsGeoJsonRequest` y `RestaurantFeature`.
- **Lista blanca.** Cada restaurante lleva su punto (`[longitud, latitud]`, seis decimales) y solo esto: `slug`, `name`, `categories` (`slug` y `name`), `delivery`, `fictitious`, `hours` (`weekday`, `opens`, `closes`) y `special_hours` (`date`, `closed`, `opens`, `closes`). Ni el id, ni contacto, dirección, dueños, plan o estado. Lo que no esté escrito en `RestaurantFeature` no sale, y una prueba compara la lista exacta de campos.
- **Un solo contrato, probado en los dos lados.** `tests/contracts/restaurants.geojson.json` es una respuesta de ejemplo con todos los campos. `tests/Feature/Api/RestaurantsGeoJsonTest.php` la compara con lo que responde el servidor (las mismas claves, en el mismo orden y con los mismos tipos) y `resources/js/restaurants/api.test.ts` comprueba que el cliente la lee sin perder nada. Un campo que cambie en un lado y no en el otro rompe una de las dos pruebas.
- **Solo cambios aditivos.** Quien tiene la app instalada sigue con el JavaScript anterior hasta que acepta «Actualizar» o la cierra (ADR 0015), y ese JavaScript pide esta misma URL. Se pueden sumar campos, que el cliente anterior ignora. Renombrar o quitar un campo, o cambiarle el tipo o el significado, es un cambio incompatible: va en una URL nueva, y esta sigue respondiendo igual mientras queden clientes que la pidan.
- **`delivery` sigue al modelo** (ADR 0009): hace domicilios si tiene zonas cargadas o, mientras no las tenga, si lo dice su casilla.
- **El idioma va en la URL**: `?lang=en`; sin parámetro, español. Una URL es una sola respuesta para cualquiera, sin `Vary`. Un idioma que la app no tiene es un 422, no español guardado bajo otra URL. El cliente pide el del idioma de la interfaz y vuelve a pedir si cambia.
- **Caché HTTP corta y revalidable**: `Cache-Control: public, max-age=60` y `ETag` (el del contenido). Pasado el minuto, el navegador revalida y recibe un 304 si nada cambió. Una ficha que se oculta deja de verse, como mucho, un minuto después.
- **El service worker no la guarda.** `/api/` no tiene ruta en `resources/js/pwa/runtimeCaching.ts`: sale a la red como si no hubiera service worker. Lo fija una prueba.
- **Límite de 60 peticiones por minuto por IP** (la real, detrás del proxy: ADR 0014). Pasado el límite, 429 con `Retry-After`.
- **Sin CORS.** La app pide su API desde su mismo origen: `config/cors.php` no habilita ninguna ruta y ninguna respuesta lleva `Access-Control-Allow-Origin` (sin ese archivo, Laravel abre `/api/*` a cualquier origen, y cada ruta nueva lo hereda). Abrir una ruta a otro origen sería una decisión nueva, con la ruta y el origen escritos, nunca `*`.
- **«Abierto ahora» se calcula en el dispositivo**, en un solo módulo (`resources/js/restaurants/openStatus.ts`), con la hora de Colombia (`America/Bogota`) esté donde esté el teléfono. El servidor manda el horario semanal y los horarios especiales desde ayer (una franja de la víspera puede pasar la medianoche) hasta siete días adelante; el cliente no busca la próxima apertura más allá. Reglas: una franja pertenece al día en que empieza; un horario especial reemplaza al semanal en su fecha y no toca la madrugada que viene de la víspera; se abre y se cierra a la hora en punto; sin ningún horario cargado el estado es «Horario sin confirmar», no «Cerrado».
- **La respuesta no lleva la hora ni el estado**: es la misma de un minuto a otro mientras no cambien los datos, y por eso el `ETag` sirve.

## Consecuencias

- El estado se mantiene al día sin volver a pedir nada: la página lo recalcula cada medio minuto y al volver del fondo.
- Depende del reloj del teléfono (no de su zona horaria). Un teléfono con la hora mal puesta verá mal el estado; los teléfonos la toman de la red.
- La lógica de «abierto ahora» no existe en PHP. La ficha (#13) puede usar el mismo módulo con el horario en sus props. Si el servidor llegara a necesitarla (un filtro «abierto ahora» resuelto en la base), habría que escribirla ahí con los mismos casos de prueba: `openStatus.test.ts` es la especificación.
- La ventana de horarios especiales depende del día: la respuesta (y su `ETag`) cambia a la medianoche solo si hay horarios especiales que entran o salen.
- Cambiar de idioma vuelve a pedir la lista (unos kB). Sin red, el cambio de idioma ya exigía conexión (ADR 0010).
- Con mala señal, si la lista no llega, el mapa se ve sin restaurantes y la página lo dice, con «Reintentar». Verlos sin conexión es la decisión pendiente del ADR 0015 (guardar datos, no HTML), y llegará con las fichas.
- Las consultas usan los índices que ya había: el de `restaurant_id` en `category_restaurant`, el único de `delivery_zones` y los GiST de las restricciones de `opening_hours` y `special_hours`, que también sirven para buscar por fecha (medido con 300 restaurantes y 67.500 horarios especiales: PostgreSQL filtra la ventana por ese índice). No hace falta uno nuevo; si `special_hours` creciera tanto que no alcanzara, sería un B-tree en `on_date`.
- La lista viaja entera. Con los restaurantes de un municipio son pocos kB comprimidos; si creciera, la forma es pedir por recuadro del mapa, que cambiaría la URL y este contrato.
- El 60 por minuto es por IP: muchos teléfonos detrás de la misma NAT comparten el cupo. La caché de un minuto hace que una persona pida la lista una vez por idioma.
