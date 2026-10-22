# ADR 0020 · «Cómo llegar»: el router de veni-mapa copiado del tag v0.2.0, el grafo bajado con la primera ruta y la posición solo dentro del motor

- Estado: aceptada
- Fecha: 2026-10-20
- Precisa: ADR 0008 (rutas en el dispositivo y «Abrir en Google Maps / Waze» por enlace), ADR 0015 (qué se guarda en el dispositivo: el grafo quedaba pendiente), ADR 0016 (capas propias: suma `belowLabels`), ADR 0018 (el restaurante elegido en la dirección) y ADR 0019 (la suscripción a la posición dentro del motor).
- Afecta a: `docs/03-arquitectura.md` («Cómo llegar» y «Qué se guarda y cómo»).

## Contexto

El issue #11 pide la ruta hasta un restaurante, a pie y en carro, calculada en el teléfono con el grafo `roldanillo-rutas.json` que publica veni-mapa y su router (`scripts/routing/router.ts`). El ADR 0008 ya decidió lo grueso: sin servidor de rutas ni API de Google Maps, y la posición nunca sale del dispositivo. Faltaba decidir:

- Cómo entra el router a la app: veni-mapa no publica un paquete.
- Cuándo baja el grafo (unos 580 kB, 215 con gzip) y si se guarda.
- Cómo recibe la ruta la posición sin sacarla del motor (el ADR 0019 dejó prevista la forma).
- Dónde va la línea (debajo de los nombres de las calles) y qué dice la dirección.
- Cuánto pesa en el arranque, que estaba en 81,9 kB de un presupuesto de 82.

## Alternativas

- **El router como dependencia npm** (por git, desde el tag). Ata el `package-lock` a un repositorio con su propio `package.json` de herramientas de compilación, y `npm ci` bajaría todo veni-mapa. Descartada.
- **Un router propio** (OSRM o GraphHopper en el navegador). Esos formatos asumen un servidor; el de veni-mapa ya es el formato que se publica. Descartada.
- **Bajar el grafo con el mapa.** Son 215 kB que la mayoría no usa en cada visita. Descartada.
- **Guardar el grafo con la versión del estilo** (en `veni-map-style`). Comparte tope con los estilos y una ruta de 500 kB podría sacarlos. Descartada.
- **El motor calcula la ruta.** Sumaría el router al chunk del mapa, que baja con cada visita. Descartada.
- **La ruta pedida en la dirección** (`/?r=slug&ruta=1`). Un enlace compartido le pediría la ubicación a quien lo abre, sin que haya tocado nada. Descartada.
- **Una entrada del historial por cada restaurante elegido.** Inertia vuelve a montar la página con «atrás» dentro del mismo inicio (`preserveState: false` en `popstate`), y el mapa se rehace. Descartada.
- **`defineAsyncComponent`** para la capa y el panel. Suma su código (y el de Suspense) al arranque, unos 0,7 kB. Descartada.

## Decisión

- **El router es una copia fija** de `scripts/routing/router.ts` y `graph.ts` del tag **v0.2.0** de veni-mapa (commit `f6da9ca`, blobs `29671d3` y `7cb5dd3`), actualizada a **v0.2.2** el 2026-10-22 (ver la nota al final), sin cambios, en `resources/js/routing/veni-mapa/`, con una cabecera que dice de dónde salió. Se actualiza copiando los archivos de otro tag, nunca a mano; el formato lleva versión (`veni-rutas` v1) y el router rechaza otra. ESLint no la revisa (es código de otro repositorio, con su estilo); el tipado estricto sí. `tsconfig.json` suma `allowImportingTsExtensions`, porque el router importa `./graph.ts` con extensión. Ambos repositorios son del mismo autor.
- **El grafo baja con la primera ruta** (`resources/js/routing/loadRouter.ts`): una sola vez por página, por `VITE_MAP_ROUTES_URL`, una URL fija que no lleva nada de quien la pide. Si falla (sin señal), se olvida el intento y «Volver a intentar» lo pide de nuevo.
- **Queda en la caché de la PWA**, `veni-map-routes`: solo esa URL (con o sin parámetros), *stale-while-revalidate*, 60 días. Con la URL fija queda una sola entrada (cada renovación la reemplaza); el tope es de dos por si la URL llega con parámetros. Desde la segunda ruta sale del teléfono, también sin señal; sin versión en la URL, se renueva detrás. Un grafo viejo sigue sirviendo para calcular. Es el mismo archivo para todos: nada personal.
- **La posición, solo dentro del motor y en memoria.** `MapHandle` suma `watchPosition` (posición, problema o «apagado», con qué darse de baja) y `requestPosition` (enciende «¿Dónde estoy?» como un toque; si MapLibre todavía no preparó el botón, espera a que lo esté). La capa de la ruta (`RouteLayer.vue`) la recibe ahí, calcula y dibuja; de ella solo salen la distancia y la duración. Nada la guarda ni la manda: ni la red, ni la dirección, ni el almacenamiento, ni las cachés. Lo fijan `RouteLayer.test.ts` y la verificación en Chrome.
- **A pie y en carro a la vez.** Las dos rutas se calculan juntas (unos milisegundos), se muestran con duración y distancia, y se dibuja la elegida. Se aclara que es una estimación (sin tráfico, semáforos ni giros prohibidos). Mientras quien la sigue camina, se recalcula cada 25 m sin mover la cámara; se encuadra la primera vez y al cambiar de perfil, con el margen del panel y de la columna de los botones del mapa (`showBounds`, ADR 0019). Al encuadrar, «¿Dónde estoy?» deja de seguir la ubicación con la cámara (sigue encendido, como cuando alguien mueve el mapa): si no, la siguiente lectura desharía el encuadre.
- **Estados, en ES y EN:** buscando la ubicación, calculando, sin ruta, lejos de las calles (más de 1 km), fuera de la región, sin señal (el grafo no bajó), el restaurante lejos de las calles, sin con qué calcular (un grafo de otro formato o sin su URL), sin permiso, sin señal de ubicación, sin geolocalización, «¿Dónde estoy?» apagado y sin mapa. Los que tienen arreglo ofrecen «Volver a intentar».
- **Debajo de las etiquetas.** El contrato del ADR 0016 suma, de forma aditiva, `belowLabels` en `MapLayerGroup`: el grupo va antes de la primera capa `symbol` del mapa base, debajo de todos los demás grupos; `order` los ordena entre ellos. La ruta (línea arrebol con borde blanco, y a trazos el tramo hasta la calle a la que se ajustó cada punta) no tapa los nombres de las calles ni los restaurantes.
- **«Abrir en Google Maps / Waze» por enlace**, sin API ni clave: `google.com/maps/dir/?api=1&destination=…&travelmode=…` y `waze.com/ul?ll=…&navigate=yes`. Solo el destino; el origen lo pone esa app.
- **La dirección dice qué restaurante está elegido** (`?r=slug`) mientras lo está, reemplazando la entrada del historial (sin pedir nada al servidor): «atrás» desde su ficha vuelve al mapa con él. Esto cambia el ADR 0018, que sacaba el parámetro al leerlo. Si el restaurante no está en la lista, sale de la dirección como antes.
- **Desde la ficha, «Cómo llegar»** (antes «Ver en el mapa») lleva a `/?r=slug` y deja pedida la ruta en la memoria de la página (`resources/js/routing/intent.ts`), no en la dirección: un enlace compartido abre el restaurante sin pedir la ubicación de nadie.
- **Atribución:** el panel dice que la ruta se calcula con datos de © colaboradores de OpenStreetMap (ODbL), con un enlace a `openstreetmap.org/copyright`, además de la atribución del mapa, que sigue siempre desplegada.
- **Peso.** La capa, el panel, el router y el grafo llegan con `import()` al pedir la primera ruta (la capa y el panel, unos 6 kB comprimidos; el grafo, 215 kB). Al arranque llegan el botón, el restaurante en la dirección y lo que carga lo demás: pasó de 81,9 a 82,6 kB, aun importando solo los colores de `brand/tokens.json` en la capa de los restaurantes (−0,2 kB). **El presupuesto del arranque sube de 82 a 83 kB** (`resources/js/map/bundle.test.ts`), que además fija que nada de la ruta viaja con el arranque. La próxima vez que no alcance, antes de subirlo se saca del arranque lo de «Cómo llegar» que sigue en él (el estado de la ruta y su aviso sin señal en el inicio, el restaurante elegido en la dirección) a un chunk que baje con el resumen; solo si no basta se sube, con un ADR. Los textos llegan con la página (props de Inertia), no en ese presupuesto.

## Consecuencias

- Cada versión nueva del formato del grafo exige copiar el router de esa versión de veni-mapa. Si la app pide el grafo de una publicación nueva con el router viejo, el router lo rechaza y la ruta dice que no puede calcularla, sin «Volver a intentar» (no es falta de señal): se nota enseguida.
- La duración es la del grafo (4,5 km/h a pie; en carro, la velocidad de cada tipo de vía): una estimación, y así se dice.
- Con «¿Dónde estoy?» encendido para la ruta, el teléfono sigue pidiendo la ubicación hasta que se apaga o se sale de la página (ADR 0019).
- La ruta es del restaurante elegido: elegir otro o cerrar el resumen la quita. Volver al mapa con «atrás» lo deja elegido, sin ruta (la ubicación no se pide sola).
- El inicio abierto con `/?r=slug` ya no limpia la dirección: «atrás» desde otra ficha vuelve a ese restaurante, que es lo que el issue pide.
- En la verificación en Chrome del 2026-10-20 el service worker no llegó a registrarse en la pila de desarrollo, así que la caché `veni-map-routes` quedó probada por las pruebas de `runtimeCaching.ts`, no en el navegador: hay que confirmarla en la imagen de producción.

## Nota de actualización (2026-10-22)

No cambia la decisión. El router se actualizó, copiado entero, al tag **v0.2.2** de veni-mapa (commit `3c5fa0d`; `router.ts` blob `93d9c08`, `graph.ts` sin cambios, blob `7cb5dd3`) por [#86](https://github.com/WokerJJ/veni-roldanillo/issues/86): la v0.2.0 ajustaba el origen y el destino al vértice más cercano, y en una calle larga la ruta podía salir de una calle sin salida vecina y dar la vuelta a la manzana ([veni-mapa#75](https://github.com/WokerJJ/veni-mapa/issues/75)). La v0.2.2 ajusta al punto más cercano sobre la calle, dentro de la red principal del perfil. El formato del grafo sigue siendo `veni-rutas` v1, así que el `roldanillo-rutas.json` publicado sirve igual.

Con eso cambia cómo la app decide «lejos de las calles»: usa `router.snap(punto, perfil) === null` (no hay calle a menos de 1 km) en lugar de `router.nearest(…) < 0` (no hay vértice a menos de 1 km), que en v0.2.2 queda obsoleto. Un punto a mitad de una vía larga sin cruces puede estar cerca de la calle y lejos de sus dos extremos: antes salía «lejos» aunque había ruta.
