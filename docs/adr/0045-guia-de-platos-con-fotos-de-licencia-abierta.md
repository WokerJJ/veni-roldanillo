# ADR 0045 · La guía de platos con fotos de licencia abierta de Wikimedia Commons, tarjetas grandes y a la vista en el inicio

- Estado: aceptada
- Fecha: 2026-11-15
- Precisa: la regla «no copiar datos ni fotos de otros sitios» de `docs/04-seguridad-y-legal.md` y el ADR 0021 (que la dejó con OpenStreetMap como única excepción y pide un ADR nuevo para otra fuente), ADR 0030 (el texto de la guía viaja como prop de su página), ADR 0036 (el ícono del plato, que queda para los que no tienen foto) y ADR 0040 y 0041 (el vidrio solo en controles; la cabecera chica del celular).
- Afecta a: `resources/js/pages/DishGuide.vue`, `pages/Credits.vue`, `pages/Home.vue`, `components/GuideTeaser.vue`, `components/links.ts`, `resources/js/guide/` (nuevo), `resources/images/guia/` (nuevo), `lang/{es,en}.json`, `lang/{es,en}/guide.php` y `docs/04-seguridad-y-legal.md`.

## Contexto

La guía de platos típicos (#21) es de lo que más distingue a Vení: dice qué es cada plato del Valle y lleva a donde se sirve hoy. Era una página de texto con un índice y un enlace subrayado en el pie. El rediseño del celular (#143, M14) la pide como tarjetas con su ícono grande, una línea de qué es y «Dónde lo sirven hoy»; el equipo pidió además que se vea («es nuestro punto fuerte»): con fotos de los platos y a la vista en el inicio, no escondida.

Fotos de los platos no teníamos. La regla del proyecto es no copiar fotos de otros sitios (Google, TripAdvisor): las fotos de las fichas las sube cada dueño con su autorización. Para la guía, que es del equipo y no de un restaurante, hacen falta fotos de platos típicos que se puedan publicar: las que tienen una licencia abierta que lo permita, con su atribución.

## Alternativas

- **Fotos propias del equipo.** Es lo ideal y lo que sigue a largo plazo, pero no hay hoy. Queda como reemplazo: cada foto se cambia por otra sin tocar nada más que el archivo y su crédito.
- **Fotos de buscadores o de otras páginas.** Sin licencia que lo permita: es lo que la regla prohíbe. Descartada.
- **Bancos de fotos libres de uso (Unsplash, Pexels).** No tienen platos del Valle del Cauca: servirían platos genéricos que no son los de la guía. Descartada.
- **Ilustraciones o solo los íconos de colombia-icons.** No venden: la guía queda parecida a lo que había. Los íconos se quedan para los platos sin foto.
- **Fotos de Wikimedia Commons con licencia abierta** (dominio público, CC BY, CC BY-SA). Las hizo gente de Colombia y de fuera, con autor y licencia públicos, y existen para la mayoría de los platos. Elegida, con las condiciones de abajo.

## Decisión

- **Una excepción más a «no copiar fotos de otros sitios», acotada** (como la de OpenStreetMap, ADR 0021): solo fotos de Wikimedia Commons con licencia de dominio público, CC BY o CC BY-SA. Nunca CC BY-NC ni CC BY-ND (impiden publicar con fines comerciales o adaptar). Otra fuente exige otro ADR.
- **Atribución en dos sitios.** En cada tarjeta, sobre la foto: «Foto: autor · licencia». Y en `/credits#fotos`: la lista de todas, con el archivo (que enlaza a su página en Commons, con autor y descripción) y la licencia (que enlaza al texto de la licencia). Los datos viven en `guide/photoCredits.ts`; una prueba falla si una foto no tiene crédito, si hay un crédito sin foto, si una licencia no es de la lista permitida o si una foto pasa del peso fijado.
- **Las fotos se recortan y comprimen** (4:3, WebP, 480 y 960 px de ancho, hasta 50 y 210 kB): es una adaptación. Las que son CC BY-SA se comparten con esa misma licencia, y así lo dice `/credits`. El código de Vení no se contagia: lo que se comparte son las fotos recortadas.
- **Dónde están.** `resources/images/guia/<plato>-480.webp` y `-960.webp`, que Vite compila con el hash en el nombre (la caché del service worker las guarda como el resto de `/build/assets/`, y una foto nueva es otra dirección). `guide/photos.ts` arma la dirección y el `srcset` de cada plato; sin foto, `null`.
- **14 de 15 platos tienen foto.** El desamargado no: no hay en Commons una que lo muestre. Su tarjeta lleva el ícono grande, en el mismo espacio.
- **La página de la guía.** Una portada de color de la marca con cuántos platos hay y un mosaico de seis fotos (decorativas: cada plato tiene su nombre más abajo); las secciones como chips que se desplazan de lado y se quedan arriba, bajo la cabecera chica del celular; y cada plato en una tarjeta con su foto de borde a borde, qué es, cuándo se come, la nota para quien visita y un botón de 44 px «Dónde lo sirven hoy» que busca el plato en el inicio. Una columna en el celular, dos desde 640 px y tres desde 1024 px. Las fotos son decorativas (`alt` vacío, el nombre del plato está en el título de la tarjeta). El texto de la guía no cambia (ADR 0030); solo la etiqueta de `search_link`, que dice «Dónde lo sirven hoy» en vez de «Buscar dónde lo sirven».
- **La guía a la vista.** En la bienvenida del celular, una tarjeta con tres fotos redondas, «Guía de platos típicos» y una frase, que lleva a `/dishes` (`GuideTeaser.vue`). Baja aparte del arranque, con los demás enlaces (`links.ts`): el arranque no suma peso. En computador la guía sigue en la navegación de la cabecera.

## Consecuencias

- Tres textos nuevos de la interfaz (`guide.count`, `guide.photo_credit` y `guide.teaser`) y dos de créditos, en `lang/{es,en}.json`.
- Las fotos pesan unos 1,5 MB en total, repartidos en 28 archivos de los que cada persona baja solo los que ve (los de 480 en el celular).
- Hay que mantener el crédito al día: al cambiar una foto, se cambia su fila en `photoCredits.ts`. La prueba obliga.
- Es mi lectura de las licencias de Commons (CC BY y CC BY-SA piden nombrar al autor, dar la licencia y no sugerir que el autor apoya a Vení); entra en la revisión jurídica pendiente antes del piloto, junto con la política de datos.
- Hay fotos mejores que otras: las de champús, pandeyuca y sancocho son de una calidad aceptable pero no de revista. Conviene reemplazarlas por fotos propias cuando el equipo las tenga.
- No se miró en un celular real: la revisión fue en el navegador del escritorio a 320 y 390 px.
