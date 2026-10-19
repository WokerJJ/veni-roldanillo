# ADR 0019 · «¿Dónde estoy?»: el control de geolocalización de MapLibre, siguiendo la ubicación, con sus avisos dentro del mapa

- Estado: aceptada
- Fecha: 2026-10-19
- Precisa: ADR 0008 (la ubicación con el control de MapLibre, el permiso al tocar y la posición solo en el dispositivo) y ADR 0016 (dejaba abierto si la ubicación sería un grupo de capas o el control de MapLibre, y preveía un margen para el panel de la página).
- Afecta a: `docs/03-arquitectura.md` («Mapa autohospedado», «Capas propias sobre el mapa», «¿Dónde estoy?» y «Geolocalización»).

## Contexto

El ADR 0008 ya decidió lo grueso: el control de geolocalización de MapLibre, el permiso pedido recién al tocar «¿Dónde estoy?» y la posición siempre en el dispositivo, sin ir al servidor ni a la URL. El issue #10 suma avisos claros, en español e inglés, para el permiso negado, la falta de señal y una posición fuera de Roldanillo. Faltaba decidir cómo se comporta el control, qué es «fuera de Roldanillo» y dónde viven los avisos.

Lo que hace el control de MapLibre 6 tal como viene:

- Un botón con su propio ícono (una imagen en su CSS) y su nombre en inglés, que pone un momento después de añadirlo (antes pregunta por el permiso a la API de permisos, sin pedirlo) y que vuelve a poner al cambiar de estado.
- **Deshabilita el botón** si el navegador no tiene geolocalización o si el permiso está negado, también cuando ya lo estaba al cargar la página.
- Una lectura por toque o, con `trackUserLocation`, un interruptor que sigue la ubicación: la cámara la sigue hasta que otro mueve el mapa, y desde ahí solo la marca.
- Encuadra el círculo de precisión (hasta zoom 15 por defecto) y avisa `outofmaxbounds` si la posición cae fuera de los límites del mapa, sin marcarla.
- La marca y el círculo son marcadores del DOM: no son parte del estilo y sobreviven al cambio de tema o de idioma (ADR 0016) sin pasar por el registro de capas.

Y del lado de la página: el panel del inicio tapa la parte de abajo del mapa en el celular y la de arriba a la izquierda en la computadora (ADR 0018), y el arranque estaba en 81,7 kB de un presupuesto de 82.

## Alternativas

- **Un grupo de capas propio (punto y círculo) con `watchPosition` a mano.** El contrato del ADR 0016 lo permite, pero sería rehacer lo que el control ya resuelve: los estados, cuándo la cámara deja de seguir, el círculo de precisión y el zoom según la precisión. Descartada.
- **Una sola lectura, sin seguimiento.** Más simple, pero la marca se queda donde uno estaba mientras camina, y no hay cómo quitarla. La ruta de #11 sale de la ubicación y tiene que moverse con quien camina. Descartada.
- **El botón como lo deja MapLibre.** Deshabilitado no explica nada, sale del orden del teclado (el foco se pierde si lo tenía) y, con el permiso negado de antes, parece roto. Descartada.
- **Los avisos como componente de Vue.** Medido: en `MapView` sumaban 1 kB al arranque (las clases de Tailwind van al único CSS de la app, y los modificadores de teclado de Vue al chunk compartido) y se pasaba del presupuesto; en un componente que baja con el motor, todavía 0,4 kB. Descartada.
- **Un recuadro propio de Roldanillo.** Repetiría lo que veni-mapa ya publica, y el mapa no puede mostrar nada fuera de sus límites. Descartada.
- **El margen del panel como `padding` persistente de la cámara** (`map.setPadding`). Correría todos los movimientos de cámara, también el de un restaurante elegido, y el mapa saltaría cada vez que el panel cambia de tamaño. Descartada.

## Decisión

- **El control de MapLibre, añadido por el motor** (`resources/js/map/engine.ts`) debajo de los botones de zoom, arriba a la derecha, donde no lo tapa el panel. **Sigue la ubicación**: es un interruptor (`aria-pressed`). Encendido, la cámara sigue a quien camina hasta que alguien mueve el mapa o elige un restaurante; ahí la marca sigue y la cámara no. Tocarlo vuelve a centrar, y otra vez lo apaga: deja de pedir la ubicación y quita la marca. Al salir de la página el mapa se libera y el control deja de pedirla.
- **El permiso, solo al tocar.** Al cargar, nadie pide la ubicación.
- **Precisión alta**, porque en un pueblo la que da la red del celular puede errar por cuadras; **10 segundos por lectura**, para darle tiempo al GPS, y ninguna posición vieja (`maximumAge: 0`). Encuadra el círculo de precisión hasta **zoom 16**, el de un restaurante elegido.
- **«Fuera de Roldanillo» es fuera de los límites del mapa**: `metadata["veni:bounds"]` del estilo, que el motor ya usa como `maxBounds` (hoy `[-76.3, 4.3, -76.0, 4.55]`, unos 33 × 28 km: el municipio y sus alrededores). MapLibre lo detecta, no marca nada ni mueve la cámara, y la marca aparece sola cuando la posición entra. Un estilo sin `veni:bounds`, o con límites que no son una región (oeste antes del este, sur antes del norte, en grados), no crea el mapa: se ve el error con «Reintentar», como sin cámara inicial, en vez de un mapa sin este aviso. veni-mapa siempre los publica.
- **El botón no queda deshabilitado** desde que MapLibre termina de prepararlo (un momento después de añadirlo; antes no atiende el toque) y lleva siempre el nombre de la app en el idioma de la interfaz y el ícono `ubicacion` de colombia-icons (en el DOM, del color del botón): un observador deshace lo que MapLibre le cambia (`resources/js/map/locate.ts`). Los estados se ven con las clases que pone MapLibre (`map.css`).
- **Con el permiso negado, el control se cambia por uno nuevo.** MapLibre cuenta en todo su módulo los controles que siguen la ubicación, y al negarse el permiso apaga el control sin descontarlo: el siguiente toque pediría una posición de hasta 10 minutos, sin precisión alta ni plazo (y sin el aviso de sin señal). Quitar el control pone la cuenta en cero; los avisos siguen y el foco pasa al botón nuevo.
- **Cuatro avisos**: sin permiso (cómo darlo: tocar otra vez y elegir «Permitir»; si no pregunta, en la configuración del sitio o en los ajustes del teléfono), sin señal o tiempo agotado (MapLibre sigue intentando), fuera de la zona del mapa y navegador sin geolocalización (ahí el toque no le llega a MapLibre, que fallaría). Van junto al botón, sin tapar el mapa ni llevarse el foco (`role="alert"`), y en el orden del teclado justo después de él; se cierran con su botón, de 44 px y con nombre, o con Escape, que no le llega a la página; el foco vuelve al botón. Con la ubicación encendida, un mismo aviso sale una vez hasta el siguiente toque o la siguiente ubicación. Cuando la ubicación llega, lo anuncia una región viva para el lector de pantalla.
- **Los avisos son parte del control**: DOM dentro del mapa, como los botones que pinta MapLibre, con sus estilos en `map.css` y los textos que la app le da al motor con los demás (`MapLabels`). Viajan en el chunk del mapa.
- **La cámara deja libre el panel.** La página le pasa a `<MapView>` lo que pone encima del mapa (`overlay`), y el motor sabe cuánto tapa: un margen de un solo lado, el que más mapa deja a la vista (`resources/js/map/padding.ts`), con al menos 88 px libres. Se mide cuando se pide, en cada encuadre de la ubicación, así una lista que se abre mientras se sigue la ubicación también cuenta. El margen es del motor, no del control: lo podrán usar `showPoint` y el encuadre de la ruta de #11.
- **La posición no sale del motor**: ni a la página (los avisos dicen qué pasó, nunca dónde), ni a la red, ni a la dirección (el mapa no usa el `hash` de MapLibre), ni al almacenamiento del navegador, ni a las cachés, la base de datos o el service worker. Lo fijan las pruebas de `MapView.test.ts` y se verifica en Chrome.
- **La ruta de #11 la recibirá dentro del motor.** Cuando exista, `MapHandle` sumará una suscripción en memoria a la posición (la que avisa el control con `geolocate`, y `null` al apagarse), que devuelve con qué darse de baja y que se corta al liberar el mapa. La ruta se calcula y se dibuja en el dispositivo con ella; nada la guarda ni la manda. No se expone antes: sin quien la use, sería una salida de la posición sin prueba que la justifique.

## Consecuencias

- La forma descansa en detalles de MapLibre 6: las clases de estado del botón (`maplibregl-ctrl-geolocate-*`), que le ponga `aria-pressed` al terminar de prepararlo, que deshabilite el botón al negarse el permiso antes de avisar `error`, la cuenta de controles que siguen la ubicación (y que quitar uno la ponga en cero), que vuelva a leer `options.fitBoundsOptions` en cada encuadre y que `Map.remove()` quite los controles. Es lo primero que hay que mirar al actualizar MapLibre: `resources/js/map/locate.test.ts` lo comprueba con el control de verdad, el doble (`resources/js/testing/maplibre.ts`) lo reproduce y la verificación en un navegador real lo confirma.
- Los tiles que se piden al mostrar la ubicación dicen qué parte del mapa se mira, como cuando uno lo mueve a mano. La posición en sí no viaja en ninguna petición.
- Encendido, el control sigue pidiendo la ubicación (y gastando batería) hasta que se apaga o se sale de la página, también si cada lectura falla.
- Un navegador sin geolocalización, o una página fuera de HTTPS, muestra el botón y lo explica al tocarlo. Dentro de un iframe sin `allow="geolocation"` (la demo en el tablero local) la política del navegador lo niega: sale el aviso del permiso.
- En un celular acostado, o entre 480 y unos 780 px de ancho, el aviso y el panel se pueden cruzar: el aviso queda encima y se cierra.
- Elegir un restaurante sigue centrándolo en el mapa entero (ADR 0018). El margen del panel, ya en el motor, está listo para usarse ahí y en la ruta de #11.
- El arranque pasó de 81,7 a 81,9 kB: solo los textos y el panel que la página le pasa al mapa. El control y sus avisos suman al chunk del mapa, que queda en 324 kB.
