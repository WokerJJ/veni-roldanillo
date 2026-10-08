# ADR 0018 · La ficha del restaurante: una dirección por slug, datos por lista blanca y el restaurante elegido en la dirección del mapa

- Estado: aceptada
- Fecha: 2026-10-08
- Precisa: ADR 0008 (la ubicación no va en la URL), ADR 0010 (rutas sin prefijo de idioma), ADR 0015 (el HTML no se guarda), ADR 0016 (anticipaba `?r=slug`) y ADR 0017 (el horario viaja y «abierto ahora» se calcula en el dispositivo).
- Afecta a: `docs/03-arquitectura.md` («Ficha del restaurante», «Restaurantes en el mapa» y «Qué se guarda y cómo»).

## Contexto

Cada restaurante necesita una página propia (#13): sus datos, el horario con el estado «abierto ahora», el menú por secciones con precios y un botón «Cómo llegar». Es la primera página pública después del inicio y la que la gente va a compartir por WhatsApp, así que su dirección queda escrita en chats, carteles y buscadores: cambiarla después cuesta redirecciones para siempre.

Había que decidir la dirección, quién ve una ficha oculta, qué datos llegan al navegador, dónde se calcula lo que cambia con el reloj, cómo llegan el título y la descripción a quien arma la vista previa de un enlace, y cómo vuelve la ficha al mapa con el restaurante ya elegido.

## Alternativas

- **`/restaurantes/{slug}`, en español.** Se lee mejor para quien vive en el pueblo. Pero las rutas del proyecto van en inglés, como el resto del código (`/locale`, `/api/restaurants.geojson`), y la misma dirección sirve los dos idiomas (ADR 0010): ninguno de los dos es «el» de la URL. Si las direcciones por idioma llegan a importar, vendrán con el prefijo `/en` que ese ADR ya prevé.
- **Por id (`/restaurants/12`).** El id de la base no viaja a ningún lado (ADR 0017), y una dirección con número se puede recorrer de uno en uno.
- **403 para una ficha oculta.** Le dice a cualquiera que ese restaurante existe en la base. Una ficha se oculta, entre otras cosas, porque su dueño pidió el retiro.
- **Los datos por una API aparte**, como los del mapa. El mapa los pide con `fetch` porque el inicio ya está abierto; la ficha es una página entera y sus datos caben en las props de Inertia, sin un segundo pedido.
- **«Abierto ahora» calculado en el servidor**, solo para la ficha. Serían dos implementaciones de la misma regla, y el mapa y la ficha podrían decir cosas distintas del mismo restaurante.
- **Una ventana más larga de horarios especiales** (un mes). Con más fechas que el mapa, un restaurante sin horario semanal podría leerse «Cerrado» en la ficha y «Horario sin confirmar» en el mapa: el módulo distingue «sin datos» por lo que recibe.
- **El título y la descripción solo desde Vue** (`<Head>`). Quien arma la vista previa de un enlace compartido no ejecuta JavaScript: vería el título general de la app.
- **«Cómo llegar» con coordenadas en la dirección** (`/?lat=…&lng=…`). El mapa ya tiene el punto de cada restaurante; y un parámetro con coordenadas, al lado del que más adelante marque el origen de la ruta, es el camino a que la ubicación de alguien termine en una URL (ADR 0008).
- **La dirección del mapa siempre al día con el elegido** (escribir `?r=` cada vez que se toca un restaurante). Es lo que haría que «atrás» desde la ficha vuelva al mapa tal como estaba. Suma un segundo sentido (de la página a la URL) que conviene decidir junto con la ruta (#11), que también tendrá estado que mostrar.

## Decisión

- **`GET /restaurants/{slug}`** (`restaurants.show`, en `routes/web.php`). El slug es el identificador público que ya viajaba en el GeoJSON. La ruta solo acepta lo que tiene forma de slug (minúsculas, números y guiones): lo demás es un 404 que no llega a la base.
- **Quién la ve lo decide `RestaurantPolicy::view`**: las publicadas, cualquiera; una oculta, un administrador y la gente del restaurante. A los demás, **404**, el mismo que el de una que no existe. El controlador pide primero el restaurante solo: una ficha oculta no llega a consultar su contenido.
- **Lista blanca.** La página recibe dos props: `restaurant`, que arma `App\Http\Resources\RestaurantProfile`, y `meta`. Lo que no está escrito en ese recurso no llega al navegador: ni el id, ni los dueños, el plan, la ubicación exacta o las fechas internas; tampoco los platos que el dueño sacó del menú, ni las opciones y adiciones (#14). El contacto (dirección, teléfono, WhatsApp) sí: es el del negocio y la ficha es donde se muestra. Una prueba compara la lista exacta de campos.
- **Ocho consultas**, tenga el menú tres platos o trescientos: el restaurante y una por tabla (categorías, horario semanal, horarios especiales, secciones, platos, zonas de domicilio y barrios). Lo fija una prueba.
- **El mismo horario que el mapa.** `hours` y `special_hours` llevan la forma del ADR 0017 (más la nota del horario especial) y la misma ventana, de ayer a siete días (`App\Support\BusinessDay`). El estado lo calcula el dispositivo con `resources/js/restaurants/openStatus.ts`, que sigue siendo la única implementación y ahora también dice qué día es en Colombia (`businessDay`), para resaltar hoy en la semana. Si hoy tiene un horario especial, la fila de hoy muestra ese.
- **El menú, como lo ordenó el restaurante**: secciones y platos por `position` y después `id`. Un plato con `available` en falso no viaja; una sección que queda sin platos, tampoco. «Agotado hoy» (`sold_out_until`) lo resuelve el servidor con el día de Colombia y viaja como un booleano: esta respuesta no se guarda en ninguna caché, a diferencia de la del mapa.
- **Los precios los escribe `Intl`** (`resources/js/i18n/intl.ts`), sin decimales: «$ 18.500» en español y «COP 18,500» en inglés, con el código de la moneda para que un turista no lo lea como dólares.
- **Título y descripción en el HTML.** El controlador manda `meta` (`title`, el nombre; `description`, la descripción del restaurante en el idioma de la petición, recortada a 155 caracteres sin partir palabras, o una frase con su nombre). La vista raíz los escribe en `<title>` y `<meta name="description">`; al navegar sin recargar los mantienen `<Head>` y `useI18n`, que deja la descripción general cuando la página no trae la suya.
- **Del mapa a la ficha.** El resumen del restaurante elegido y cada elemento de la lista accesible enlazan a la ficha. El frontend arma la dirección con el slug (`resources/js/restaurants/links.ts`); una prueba fija que es la misma de la ruta. El contrato del GeoJSON no cambia.
- **«Cómo llegar» lleva a `/?r=slug`.** El inicio lee el parámetro una vez, de la dirección con que respondió el servidor; cuando llega la lista, si el restaurante está en ella, lo elige (se abre su resumen, con el foco en su nombre) y la cámara va hasta él, también si el mapa empieza a pintar después. Si no está (se ocultó, o el enlace está mal escrito), el inicio abre como siempre. **En la dirección solo viaja el restaurante**; la ruta se calcula en el dispositivo y es de #11.
- **El WhatsApp es un dato de contacto**: un enlace a `wa.me` sin mensaje. Armar el pedido es del carrito (#15).

## Consecuencias

- La dirección es estable mientras lo sea el slug, que hoy solo cambia el sistema. Cuando un panel deje renombrar un restaurante (#18, #19), el slug viejo necesitará una redirección.
- El mapa y la ficha dicen lo mismo de un restaurante: mismo horario, misma ventana, mismo módulo. A cambio, un cierre anunciado a más de una semana no se ve en la ficha todavía; ampliar la ventana pide que `openStatus.ts` deje de contar las fechas que no mira.
- La ficha no se guarda en ningún lado: ni el HTML (ADR 0015) ni sus props. Sin señal no hay menú; guardarlo es la decisión que ese ADR dejó pendiente (datos, no HTML).
- Quien sigue desde el mapa el enlace de una ficha que se ocultó en ese minuto recibe el 404 dentro del aviso con que Inertia muestra las respuestas que no son suyas, sin los estilos de la página de error. Pasa con cualquier error en una visita de Inertia (419, 429, 500): se resuelve una vez, para todas, con páginas de error propias en la app.
- Cerrar el resumen o elegir otro restaurante no cambia la dirección: `/?r=slug` dice con cuál abrió el mapa, no cuál está elegido. Y «atrás» desde la ficha vuelve al mapa sin nadie elegido. Las dos cosas se deciden con #11.
- El CSS de Tailwind es uno solo para todas las páginas: los estilos de la ficha bajan con el arranque (0,6 kB comprimidos). Con los enlaces del mapa a la ficha, el arranque pasó de 79 a 80,5 kB y su presupuesto, de 80 a 85 (`resources/js/map/bundle.test.ts`). El código de la ficha es un chunk aparte. Si el CSS sigue creciendo con cada página, habrá que partirlo.
- El contenedor del mapa ahora nace con su alto. MapLibre le pone su clase, con `position: relative`, y sin un alto propio medía cero: el mapa se creaba con 300 px y se corregía al pintar. Una cámara que saliera en ese rato hacia el restaurante elegido lo dejaba fuera del centro.
- En un celular, el resumen del elegido tapa la parte de abajo del mapa y la cámara centra el punto en el mapa entero: queda justo encima del panel. El margen para el panel es la extensión que el ADR 0016 previó para #11.
- Quedan fuera, con su issue: las fotos de los platos y sus etiquetas, las opciones y adiciones (#14), el pedido por WhatsApp (#15), el registro de clics (#22) y «¿Es tu negocio?» (#20). Tampoco hay todavía etiquetas Open Graph: la vista previa de un enlace usa el título y la descripción.
