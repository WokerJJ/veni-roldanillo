# ADR 0016 · Capas propias sobre el mapa: un registro en el motor y componentes dentro de `MapView`

- Estado: aceptada
- Fecha: 2026-10-07
- Precisa: ADR 0007 (los restaurantes son una capa GeoJSON encima del mapa base; MapLibre se carga solo en las pantallas con mapa) y ADR 0008 (la ubicación y la ruta se pintan en el dispositivo).
- Afecta a: `docs/03-arquitectura.md` («Mapa autohospedado» y «Capas propias sobre el mapa»).

## Contexto

El mapa del inicio (#8) solo mostraba el mapa base. La revisión de #8 dejó anotado lo que faltaba antes de pintar algo encima: `MapView` no tenía dónde enganchar capas, y cambiar de tema o de idioma es cambiar de estilo (`setStyle` con `diff: false`, porque cada tema trae sus sprites), que **borra las fuentes, las capas y las imágenes añadidas en ejecución**. Sin resolverlo, los restaurantes desaparecerían al tocar el botón del tema.

Tres cosas van a pintar sobre el mapa: los restaurantes (#9), la ubicación de quien lo usa (#10) y la ruta hasta un restaurante (#11). Las tres tienen que sobrevivir al cambio de estilo, convivir en un orden (la ruta debajo de los restaurantes) y no traer MapLibre al bundle inicial (ADR 0007).

Dos detalles de MapLibre condicionan la forma:

- Tras `setStyle`, el estilo nuevo carga en el siguiente cuadro. Hasta entonces `addSource` y `addLayer` lanzan «Style is not done loading». Y si se piden dos estilos seguidos con `transformStyle`, el segundo espera a que cargue el primero, y de los dos el mapa solo avisa «style.load» del último.
- Las imágenes de `icon-image` no son parte del JSON del estilo: se añaden aparte con `addImage` y también se pierden.

## Alternativas

- **Volver a añadir todo en «style.load».** Es lo más corto, pero el estilo nuevo se pinta un cuadro sin las capas (un parpadeo en cada cambio de tema), y cada componente tendría que saber cuándo puede tocar el mapa.
- **Marcadores HTML (`Marker`) en vez de capas.** No dependen del estilo, así que sobreviven solos, y son botones de verdad. Pero no sirven para una ruta (una línea), agrupar los que se superponen habría que hacerlo a mano, y cada marcador es un elemento más que el navegador recoloca en cada cuadro. La accesibilidad se resuelve con una lista alternativa (ver #9).
- **Que cada componente importe MapLibre y hable con el mapa.** MapLibre dejaría de importarse en un solo módulo y el bundle inicial quedaría a un `import` de traérselo entero.
- **Cambiar de estilo con `diff: true`.** MapLibre conservaría lo añadido solo si el estilo nuevo lo trajera; no lo trae, y el cambio de sprites entre temas obliga a reemplazar el estilo entero.

## Decisión

- **El motor guarda un registro de capas propias** (`resources/js/map/layerRegistry.ts`, que crea `engine.ts`). Un grupo (`MapLayerGroup`, en `resources/js/map/layers.ts`) declara sus fuentes GeoJSON, sus capas, sus imágenes ya decodificadas y qué capas se pueden tocar. `MapHandle.addLayerGroup(grupo)` lo registra y devuelve con qué cambiar sus datos (`setData`), acercar un grupo de puntos (`expandCluster`) y quitarlo (`remove`).
- **Al cambiar de estilo, las capas entran con él.** El motor llama a `setStyle` con un `transformStyle` del registro, que mete las fuentes (con sus datos del momento) y las capas en el estilo que llega, antes de que MapLibre lo aplique: no hay cuadro vacío. Las imágenes se vuelven a añadir en «style.load», que ocurre antes de que MapLibre arme los símbolos que las usan.
- **Mientras un estilo carga, los cambios solo se anotan.** El registro anota que hay un estilo pedido sin cargar; hasta que el mapa avisa «style.load», `setData`, registrar o quitar un grupo no tocan el mapa: quedan en el registro y entran con el estilo, porque `transformStyle` lee el registro cuando MapLibre lo llama, no cuando se pidió el cambio. Es una marca y no una cuenta de avisos: con varios estilos pedidos seguidos llega uno solo, el del último.
- **`MapView` reparte el mapa a lo que lleva adentro.** Lo que la app pinta sobre el mapa son componentes en su slot:

  ```vue
  <MapView>
      <RestaurantsLayer />
  </MapView>
  ```

  `MapView` da el mapa con `provide` (`MAP_CONTEXT`: una referencia que vale `null` mientras carga o si falló) y cada componente registra su grupo con `useMapLayers(grupo)` (`resources/js/map/useMapLayers.ts`), que lo pone cuando el mapa ya pinta, lo vuelve a poner si el mapa se rehace («Reintentar») y lo quita al desmontar. Esos módulos solo importan tipos: **MapLibre se sigue importando únicamente en `map/engine.ts`**.
- **Ids con el prefijo del grupo.** Las fuentes, capas e imágenes de un grupo empiezan por su id (`restaurants`, `restaurants-clusters`). El registro rechaza lo demás: así no chocan con el mapa base ni entre grupos.
- **Orden explícito.** Todos los grupos van encima del mapa base. Entre ellos manda `order` (menor, más abajo) y, a igual número, el orden de registro; se respeta también al volver a meterlos en un estilo nuevo.
- **Los toques los resuelve el registro.** Un clic consulta las capas tocables en un cuadrado de 44 px alrededor del punto (regla 9 de producto), aunque la figura se dibuje más chica, y avisa al grupo de más arriba con la figura más cercana. Con ratón, el cursor cambia sobre lo que se puede tocar.
- **La cámara, por el motor.** `MapHandle.showPoint([lng, lat], { minZoom })` lleva el mapa a un punto sin alejarlo. El resto de la cámara sigue siendo de quien usa el mapa.

## Consecuencias

- #10 y #11 se apoyan en este contrato y lo amplían sin romperlo: la ruta es un grupo con una fuente GeoJSON de línea y un `order` menor que el de los restaurantes; la ubicación, otro grupo (punto y círculo de precisión) con uno mayor, o el control de geolocalización de MapLibre, que el motor añadiría como añade los de zoom. Lo que hoy falta se suma, y lo que ya registra un grupo sigue valiendo igual. Las extensiones previstas:
  - **Un ancla para pintar debajo de las etiquetas.** Hoy todo grupo va encima del mapa base entero, y una ruta así taparía los nombres de las calles. Un campo opcional en `MapLayerGroup` dirá que sus capas entran debajo de las etiquetas del estilo; sin él, el grupo va encima, como ahora. El registro tendrá que respetarlo también al volver a meter las capas en un estilo nuevo.
  - **La cámara, con margen para el panel.** `MapHandle.fitBounds` para encuadrar una ruta, y un margen opcional en él y en `showPoint`: lo que se muestra no puede quedar debajo del panel de la página.
  - **El restaurante elegido, en la URL** (`?r=slug`). «Cómo llegar» sale de la ficha (#13) y tiene que abrir el mapa con ese restaurante ya elegido. Es de la página, no del registro: la capa ya recibe el elegido como dato. Solo va el restaurante; la ubicación de quien usa el mapa no pasa por la URL (ADR 0008).

  Lo demás que necesiten de MapLibre (un control) se suma a `MapHandle`, en `engine.ts`.
- El registro se prueba contra un doble de MapLibre (`resources/js/testing/maplibre.ts`) que reproduce lo que importa: reemplazar el estilo borra lo añadido, el estilo nuevo no carga al instante, dos seguidos esperan su turno y solo el último avisa «style.load». Lo que el doble no puede probar (que MapLibre de verdad se comporte así) lo cubre la verificación en un navegador real; la prueba de humo con navegador sigue pendiente en #40.
- Los datos de una fuente viven dos veces en memoria: en el registro y en MapLibre. Con los restaurantes de un municipio no pesa; una fuente grande tendría que cargarse por URL, que este contrato no cubre.
- Las propiedades de una figura tocada llegan aplanadas (MapLibre devuelve las listas y los objetos como texto JSON): un grupo pone un identificador en las propiedades y busca el resto en sus propios datos.
- Una imagen se registra ya decodificada: quien la necesita la prepara (y decide qué hacer si no baja) antes de registrar el grupo, o lo registra de nuevo cuando la tiene.
- Si una versión de MapLibre cambiara cuándo llama a `transformStyle` o dejara de avisar «style.load», las capas se perderían al cambiar de tema sin ningún error: es lo primero que hay que mirar al actualizar MapLibre.
