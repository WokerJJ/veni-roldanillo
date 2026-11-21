# ADR 0052 · Modo «Campo», etapa 2: la carta en la captura, un catálogo de productos y las bebidas alcohólicas con aviso de mayores de 18

- Estado: aceptada
- Fecha: 2026-11-19
- Precisa: ADR 0048 (el modo Campo y sus dos firmas), ADR 0023 (opciones del plato), ADR 0027 (panel de administración y acciones de dominio), ADR 0039 (rango de precios de la carta) y ADR 0024 (el pedido por WhatsApp).
- Afecta a: `database/migrations` (`catalog_groups`, `catalog_items`, `catalog_variants` y `dishes.is_alcohol`), `app/Models/Catalog*.php`, `app/Actions/Restaurants/ReceiveFieldSubmission.php` y `ApproveFieldSubmission.php`, `app/Http/Requests/Field/`, `app/Support/Field/`, `app/Filament/Admin/Resources/Catalog/`, `database/seeders/CatalogSeeder.php`, `resources/campo/`, la ficha pública (`resources/js/pages/Restaurants/Show.vue`, el carrito y `resources/js/order/message.ts`), `app/Filament/Owner/Resources/Dishes/`, `lang/`, `docs/03-arquitectura.md` y `docs/04-seguridad-y-legal.md`.

## Contexto

La etapa 1 levanta la ficha base de un negocio con dos firmas. Una ficha sin carta no sirve para pedir: el valor del directorio está en los platos y sus precios. En la visita, el dueño dicta la carta, y escribirla plato por plato en un celular, de pie y con mala señal, es lo que más tiempo toma. Lo que más se repite en cualquier restaurante colombiano son las bebidas de marca (gaseosas, jugos, aguas, energizantes, cervezas): las mismas marcas, las mismas presentaciones, con un precio por tamaño.

Decisiones del producto que este ADR no discute: la carta viaja en la **misma captura y las mismas dos firmas** (el dueño confirma también los platos y los precios, y administración aprueba); sin fotos todavía; un **catálogo** que mantiene administración y que viaja a `/campo` para funcionar sin señal; las **bebidas alcohólicas sí se incluyen**, con aviso de mayores de 18; de las marcas se usa **solo el nombre como texto**.

## Alternativas

- **Una carta aparte, enviada después de la ficha.** Dos capturas que confirmar y dos enlaces para el dueño. Se descarta: la autorización del dueño es sobre lo que se publica, y la carta es la mayor parte.
- **Teclear cada bebida a mano en cada local.** Es lo que ya se puede hacer. Se mantiene para los platos propios, pero no para cientos de bebidas repetidas.
- **Una tabla de marcas y otra de productos, solo para bebidas.** No sirve para «jugos naturales» (mora, lulo, maracuyá en vaso o jarra) ni para «adicionales». **Tres tablas genéricas**: grupo, producto y variante.
- **Guardar la carta capturada en tablas propias.** Duplica `menu_sections` y `dishes` para algo transitorio. La carta va en el `payload` jsonb de la captura (versión 2) y solo al aprobar se vuelve filas reales: así la huella del contenido que firma el dueño la cubre sin otra tabla.
- **Traducir al inglés con un servicio.** Manda lo que dicta el dueño a un tercero. El inglés sale solo del catálogo (el nombre en inglés lo escribe administración); lo que se teclea queda en español, como hoy el menú de los dueños.
- **Aviso de mayores de 18 por restaurante.** Un restaurante mezcla bebidas con y sin alcohol: la marca es **por plato** (`dishes.is_alcohol`).
- **Verificar la edad en la app.** La plataforma no cobra, no entrega y no vende: no puede verificar a nadie. El aviso informa; la venta y su regla son del restaurante.

## Decisión

### 1. El catálogo

Tres tablas, que mantiene administración (recurso «Catálogo» en `/admin`):

- `catalog_groups`: `slug`, `name_es/en`, la **sección del menú** que crea (`section_name_es/en`, por ejemplo «Bebidas»), `is_alcohol` (valor por defecto de sus productos) y `position`. Ejemplos: Gaseosas, Jugos de caja, Aguas, Energizantes, Cervezas, Licores, Jugos naturales, Adicionales.
- `catalog_items`: `group_id`, `brand` (texto, opcional: «Postobón»), `name_es/en`, `is_alcohol`, `active` y `position`.
- `catalog_variants`: `item_id`, `label` (la presentación: «400 ml», «1,5 L», «Vaso», «Jarra»), `active` y `position`.

El nombre del plato es **«producto + presentación»** («Manzana Postobón 400 ml»). Un producto sin presentaciones crea un plato con solo su nombre. Es un mecanismo, no una lista de bebidas: otro paquete repetido (adicionales, tamaños) es otro grupo.

**Solo texto.** Se usan nombres de productos como los datos del menú que el restaurante vende; nunca logos, imágenes ni material de las marcas, y la tabla no tiene dónde guardarlos. El permiso de uso de marcas (nominativo o no) queda para la revisión jurídica junto a lo demás.

**Sin señal.** `GET /campo/api/me` entrega el catálogo activo con una **versión** (huella de su contenido); el teléfono lo guarda en IndexedDB y lo reemplaza solo cuando cambia. El catálogo viaja con `/campo`, no con la app pública.

**Datos.** `CatalogSeeder` carga lo común en Colombia (gaseosas, jugos, aguas, energizantes, cervezas y licores, con sus presentaciones típicas) como punto de partida editable. A diferencia de los seeders de ejemplo, es **dato de referencia real**: no hereda de `FictitiousSeeder` y se puede correr en producción (`php artisan db:seed --class=CatalogSeeder`, que solo agrega y no pisa lo que administración editó).

### 2. La carta en la captura

El `payload` pasa a la **versión 2** y suma `menu`: una lista de secciones (`name_es`, `name_en` opcional) con sus platos (`name_es`, `name_en` opcional, `price` en pesos enteros, `is_alcohol`, y `catalog_variant_id` solo como procedencia). Una captura de la versión 1 (sin `menu`) sigue valiendo. Límites: 12 secciones, 60 platos por sección y 300 en total; precio de 0 a 9 999 999; nombres de texto plano (`PlainText`).

- **Inglés automático para los de catálogo.** Al **aprobar**, un plato que trae `catalog_variant_id` y no trae `name_en` recibe el nombre en inglés del catálogo (producto en inglés, marca y presentación; se lee en el servidor, no se confía en el cliente). Se arma al aprobar y no al recibir a propósito: el inglés no es parte de lo que firma el dueño, y así editar el catálogo entre dos reintentos de un mismo envío no cambia la huella ni da un conflicto. `catalog_variant_id` solo se acepta si la presentación existe y está activa.
- **Lo que firma el dueño.** La página de confirmación muestra la carta completa con precios (y el «+18» de lo alcohólico). Subir el contenido que se firma exige subir `AUTHORIZATION_VERSION` (a `0.2`: el texto ahora cubre la carta y los precios) y su huella de `tests/fixtures`. El mensaje de WhatsApp resume la carta («Carta: N platos en M secciones») y manda al enlace para verla completa: un mensaje con trescientos platos no se lee.
- **Idempotencia y sin señal**: igual que la etapa 1 (uuid del teléfono, `PUT`, huella). La carta es parte del mismo borrador.

### 3. Cómo se aplica al aprobar

`ApproveFieldSubmission` crea, en la misma transacción que la ficha, las **secciones** (`menu_sections`, con `position` y `counts_for_price_range` por el nombre, como siempre) y los **platos** (`dishes`, con `is_alcohol`). Si la ficha vinculada ya tiene secciones o platos, se rechaza (`MENU_EXISTS`): cambiar una carta existente es la etapa 3, no se pisa en silencio. La ficha sigue **oculta**; se publica con `PublishRestaurant`.

### 4. Los pasos de `/campo`

Dos pasos nuevos, antes de «Dueño»:

- **Carta:** secciones y platos propios (nombre, precio, ¿es bebida alcohólica?), con el teclado numérico para el precio.
- **Catálogo** («Bebidas y paquetes»): por grupo y marca, se marcan los productos y las presentaciones que vende; las marcadas aparecen **agrupadas por presentación** con un campo «Poner a todas las de 400 ml: $3.500» y su precio fila por fila para ajustarlo. Una sola pasada crea los platos de la sección del grupo («Bebidas»). Lo marcado vuelve a aparecer marcado al reabrir.

Ambos son un chunk que baja con `/campo`, no con la app pública: el arranque no cambia (`bundle.test.ts` lo fija como en la etapa 1).

### 5. Las bebidas alcohólicas y los menores de 18

- **Marca por plato** (`dishes.is_alcohol`, booleano, falso por defecto). Los productos de catálogo la traen de su grupo o producto; en la carta tecleada, el administrador la marca; el panel del dueño la ofrece al crear o editar un plato.
- **Aviso visible** en la ficha pública (una nota en la sección que tenga alcohol y un «+18» en el plato), en el carrito (un aviso antes de enviar) y **en el mensaje de WhatsApp del pedido** («Incluye bebidas alcohólicas: solo para mayores de 18 años»). Los textos van por `lang/{es,en}.json`, en los dos idiomas.
- **La plataforma no vende ni entrega**: informa. No hay pago, no hay entrega, no hay verificación de edad en la app, y el pedido sigue siendo un mensaje que la persona le manda al restaurante. La responsabilidad de no vender alcohol a menores de edad es de quien lo expende.
- **Criterio legal: pendiente de revisión jurídica, junto a lo demás.** No se citan artículos en este ADR porque no se pudieron verificar contra el texto oficial al escribirlo (los portales oficiales consultados no respondieron). Lo que debe revisar un abogado antes del piloto con negocios reales: la prohibición de vender alcohol a menores de edad (Ley 124 de 1994) y lo que dicen el Código de la Infancia y la Adolescencia (Ley 1098 de 2006), el Decreto 120 de 2010, la Ley 1816 de 2016 y el Código de Policía (Ley 1801 de 2016); si mostrar precios y tomar pedidos de alcohol por una plataforma se considera publicidad o venta a distancia y qué exige; si el aviso de «mayores de 18» alcanza o hace falta algo más; los horarios y restricciones de venta que fije el municipio de Roldanillo; y el permiso de usar los nombres de las marcas como texto.

## Consecuencias

- Una ficha de campo ya puede salir con su carta: del teléfono a la ficha oculta con sus platos, tras las dos firmas.
- El catálogo es un dato más que mantener: administración lo edita en `/admin`; el teléfono lo recibe cuando abre `/campo` con señal y puede quedar atrasado hasta entonces (el servidor es el que manda al recibir: un producto que se desactivó no se acepta).
- La carta del `payload` es jsonb validado en el servidor: no hay restricción de la base por plato hasta que se aprueba (donde sí rigen las de `dishes`).
- `dishes` gana una columna; la ficha, el carrito y el mensaje del pedido cambian **solo** cuando hay un plato alcohólico: el resto de los pedidos sale igual.
- El texto de autorización pasa a `0.2` y sigue siendo provisional: la etapa 2 tampoco se usa con negocios reales hasta la revisión jurídica.
- Riesgo asumido: nada impide que un restaurante marque un plato alcohólico como no alcohólico; es declarativo, como todo lo que el dueño publica.
