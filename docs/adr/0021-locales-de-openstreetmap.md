# ADR 0021 · Locales de OpenStreetMap: borradores ocultos con su procedencia, bajo ODbL

- Estado: aceptada
- Fecha: 2026-10-20
- Precisa: la regla «no copiar datos de otros sitios» de `docs/04-seguridad-y-legal.md`, ADR 0009 (modelo de datos: el estado `hidden`) y ADR 0017 (el GeoJSON público solo lleva fichas publicadas).
- Afecta a: `docs/04-seguridad-y-legal.md` («Derechos de autor» y «OpenStreetMap»), `docs/03-arquitectura.md` («Locales importados de OpenStreetMap»).

## Contexto

El directorio arranca vacío: cada ficha hay que levantarla en la calle. OpenStreetMap ya sabe dónde están buena parte de los locales de comida de Roldanillo (la consulta del 2026-10-08 sobre el área del mapa trajo 88; 78 con nombre). Esos datos sirven como punto de partida del recorrido, no como fichas listas: pueden estar viejos o mal ubicados.

La regla del proyecto era no copiar datos de otros sitios. Google, TripAdvisor y los directorios automáticos no dejan reutilizar lo que publican. OpenStreetMap sí, bajo la Open Database License (ODbL 1.0): pide atribución, que la base derivada quede bajo la misma licencia y ofrecerla a quien la pida. El mapa base ya usa sus datos (ADR 0007) y muestra su atribución.

Había que decidir qué se trae, cómo se guarda de dónde vino, qué pasa al volver a correr la importación, qué se hace con un local sin nombre y cómo se cumple la licencia.

## Alternativas

- **Seguir sin importar nada.** Cada ficha sale de cero, y el recorrido no tiene por dónde empezar.
- **Publicar lo importado de una vez.** Sería mostrar como reales locales que tal vez cerraron, con el punto corrido. La regla de la app es verificar en la calle antes de publicar.
- **Traer todo lo que tenga el objeto** (teléfono, horario, sitio web, redes). Pocos lo tienen (3 de 88 con teléfono) y un teléfono viejo manda pedidos a otra persona. El contacto lo confirma el negocio, no OpenStreetMap. Tampoco correos ni redes: son datos que la app solo publica con autorización.
- **La procedencia en columnas de `restaurants`.** Cuatro o cinco columnas casi siempre vacías en las fichas propias y una restricción única con nulos. Una tabla aparte deja `restaurants` como estaba y una ficha propia, sin fila de procedencia.
- **Decidir «editado a mano» por `updated_at`.** Cualquier cambio del sistema (o de la propia importación) lo mueve. Una huella de lo que escribió la importación dice exactamente si alguien cambió el nombre, el punto o la categoría.
- **Un local sin nombre como ficha «Sin nombre».** Una ficha sin nombre no sirve para buscar, ni para compartir, ni da un slug que dure.
- **Consultar por un recuadro siempre.** Es más rápido, pero el recuadro del límite también cubre parte de los municipios vecinos. Queda como respaldo, y solo para actualizar.
- **Filtrar el respaldo por el polígono del límite.** Exige traer su geometría (otra consulta pesada a Overpass) o guardarla en el repositorio y mantenerla. No vale la pena para un respaldo: basta con que el recuadro no cree fichas.
- **Un campo aparte para el tipo de local.** El tipo con que vino ya está en la procedencia (`element_kind`); otra columna en `restaurants` duplicaría eso para todas las fichas.

## Decisión

- **OpenStreetMap sí, bajo ODbL; Google, TripAdvisor y similares, no.** Es la única excepción a «no copiar datos de otros sitios», y otra fuente exige un ADR nuevo (y un valor nuevo en la columna `source`).
- **Se trae solo nombre, tipo y punto.** Nunca teléfonos, correos, sitios web ni redes, aunque el objeto los tenga. El tipo se traduce a una categoría de la app; las que falten se crean con su nombre en ES y EN:

  | En OpenStreetMap | Categoría |
  | --- | --- |
  | `amenity=restaurant` | `restaurantes` (nueva) |
  | `amenity=fast_food` | `comidas-rapidas` |
  | `amenity=cafe`, `shop=bakery`, `shop=pastry` | `panaderia-cafeteria` |
  | `amenity=ice_cream` | `heladeria-postres` |
  | `amenity=bar`, `amenity=pub` | `bares` (nueva) |
  | `amenity=food_court` | `plazoletas-de-comida` (nueva) |

  Una categoría que ya existe se usa tal cual, con el nombre que tenga.

  **La categoría importada es provisional.** El catálogo es de tipos de comida, y `restaurantes` y `bares` son tipos de local: no dicen qué se come. Se usan solo para que la ficha oculta tenga una categoría mientras se verifica; el tipo de local con que vino queda en la procedencia (`element_kind`). En el recorrido se le pone la categoría de su comida (la casilla «La categoría está bien») antes de publicarla, y desde ese cambio la importación ya no la toca.
- **Toda ficha importada nace oculta** (`hidden`): no sale en el GeoJSON público ni tiene ficha visible (404, como una que no existe) hasta que alguien la publique después de verificarla. Mientras no haya panel de administración (#19), se publica con `php artisan veni:publish {slug}`: exige que la ficha esté verificada (`verified_at`) o que quien la publica lo registre con `--verified`, que guarda la fecha de ahora. Queda `claimed` si ya tiene dueño y `unclaimed` si no (los estados de `RestaurantStatus::published()`); una ficha descartada no se publica.
- **Procedencia en `restaurant_sources`**, una fila por ficha importada: fuente (`openstreetmap`), tipo (`node`, `way`, `relation`) e id del objeto, el tipo de local con que vino, la fecha de la última consulta en que estaba, la huella de lo importado desde cuándo ya no está y desde cuándo se descartó. Un índice único sobre fuente, tipo e id impide dos fichas del mismo objeto. Si se borra la ficha, se borra su procedencia (y el objeto volvería en la próxima importación). Para descartar un local que en la calle no existe, `php artisan veni:osm-dismiss {slug}` guarda `dismissed_at`: la ficha sigue oculta y la importación ya no la actualiza, no la lista para verificar ni la marca como ida.
- **El comando `veni:osm-import`** consulta Overpass por el límite administrativo de Roldanillo (relación 1473594) y, si esa consulta falla (suele dar 504), una vez más por el recuadro del límite: a lo sumo dos consultas por corrida, con un User-Agent propio y el `timeout` de Overpass; ante un 429 no reintenta. Los puntos de vías y relaciones son su centro.
- **El respaldo por recuadro solo actualiza.** El recuadro también cubre parte de los municipios vecinos: con él no se crean fichas, los locales sin nombre no se listan y no se marca nada como ido. El informe dice cuántos locales nuevos quedaron sin crear; entran en una corrida en que responda la consulta por el límite.
- **Una corrida no escribe si no es fiable.** Dos a la vez no corren: la segunda termina con un mensaje (cerrojo `pg_try_advisory_xact_lock`). Una respuesta sin ningún local cuando ya hay fichas importadas se toma como una consulta rota y falla sin escribir. La ficha que se va a actualizar se lee bloqueada (`FOR UPDATE`), para no pisar una edición que llegue a la vez. Los elementos se procesan ordenados por tipo e id, así los sufijos de los slugs (`-2`, `-3`) no dependen del orden de la respuesta.
- **Volver a correrlo no duplica ni pisa.** Un objeto nuevo crea una ficha; uno que ya está actualiza nombre, punto y categoría solo si la ficha sigue oculta, sin verificar, sin cambios del dueño y con la misma huella que dejó la importación. Si no, la omite. Al crear una ficha, si ya hay otra a menos de 30 m con un nombre parecido, la informa como posible duplicado: no fusiona nada. Lo que ya no aparece queda marcado (`missing_since`) y se lista: no se borra ni se oculta solo. Informa cuántas creó, actualizó, dejó igual y omitió. `--dry-run` hace la misma cuenta sin escribir nada.
- **Un local sin nombre no se importa.** Se cuenta como omitido y va al listado del recorrido con su enlace, para buscarlo en la calle; si se confirma, se le pone nombre en OpenStreetMap o se crea la ficha a mano.
- **El listado para el recorrido** (Markdown, en `storage/app/private/osm/`) trae cada ficha importada que sigue oculta, sin verificar y sin descartar, con su nombre, su tipo, el enlace al punto en openstreetmap.org, una casilla por cosa que se comprueba y los comandos para publicarla o descartarla; además, los posibles duplicados, los locales sin nombre y los que ya no están.
- **Atribución en `/credits`**, una página pública en ES y EN enlazada desde la bienvenida del inicio y desde el pie: el mapa y parte del directorio vienen de OpenStreetMap, bajo ODbL, y quien quiera la parte de la base que viene de allí la pide y se le entrega bajo la misma licencia. Se genera con `php artisan veni:osm-export`: un GeoJSON (en `storage/app/private/osm/export/`) con nombre, tipo, punto, identificador del objeto y procedencia de cada ficha importada, con la licencia y la atribución.

## Consecuencias

- El recorrido empieza con una lista, y cada ficha sabe de dónde vino aunque después la editen.
- La importación no corre sola: alguien la lanza y revisa el informe. Si Overpass no responde, no se fuerza.
- Publicar depende de alguien que verifique. Hasta el panel (#19), por consola (`veni:publish`).
- Si Overpass solo responde por el recuadro, la corrida no suma locales nuevos: hay que volver a correrla.
- Quien edite una ficha importada la «suelta»: la importación ya no la actualiza aunque OpenStreetMap cambie.
- Cumplir ODbL obliga a entregar la parte derivada cuando la pidan; hoy se pide por el repositorio, hasta que haya un correo del proyecto.
