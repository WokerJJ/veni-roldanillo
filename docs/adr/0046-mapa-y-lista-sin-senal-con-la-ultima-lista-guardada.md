# ADR 0046 · Mapa y lista sin señal: la última lista de restaurantes que llegó, guardada en el teléfono y a la vista con su hora

- Estado: aceptada
- Fecha: 2026-11-16
- Precisa: ADR 0015 (PWA: el HTML nunca se guarda, el PMTiles tampoco, toda caché con tope) y ADR 0017 (`/api/restaurants.geojson` público; el service worker no guarda `/api/`). Respeta las reglas de producto 2 y 3 (la ubicación nunca se guarda) y la 8 (la app tiene que servir con mala señal).
- Afecta a: `resources/js/restaurants/savedList.ts` (nuevo), `restaurants/useRestaurants.ts`, `components/StaleNotice.vue` (nuevo), `components/links.ts`, `pages/Home.vue`, `resources/js/offline.ts`, `resources/css/offline.css`, `resources/views/offline.blade.php`, `lang/{es,en}.json` y `docs/03-arquitectura.md`.

## Contexto

Con mala señal, hoy la app muestra dos cosas: el mapa vacío si los restaurantes no llegan («No pudimos cargar los restaurantes») y, si ni el HTML llega, la página «Sin señal o muy lenta» (#5), que solo dice eso. Quien ya abrió la app antes en el mismo teléfono ya vio la lista de restaurantes; con datos móviles que se cortan en la plaza, lo razonable es enseñarle esa lista, avisando que puede estar desactualizada, y no una pantalla vacía.

El service worker no puede hacerlo por nosotros: no guarda `/api/` (ADR 0017: la lista cambia, el servidor la deja guardar un minuto), y el HTML de la página nunca se guarda (ADR 0015: depende de la sesión, el idioma y el token CSRF). Los mosaicos del mapa tampoco (el PMTiles se pide por rangos y la Cache API no guarda respuestas parciales). Sin mosaicos, el mapa sin señal es un fondo liso con los marcadores encima, o nada.

## Alternativas

- **Guardar `/api/restaurants.geojson` en la caché del service worker** (stale-while-revalidate). Contradice el ADR 0017 y el 0015 (un 200 viejo serviría datos que el servidor ya no publica, sin que nadie lo diga) y obliga a que el aviso lo calcule el service worker. Descartada: la copia en el dispositivo da lo mismo, con la hora a la vista y el control en la app.
- **Guardar el HTML de la página de inicio.** Lo prohíbe el ADR 0015. Descartada.
- **Guardar también el mapa** (descarga explícita de una release fija del PMTiles, 1,6 MB). Es la forma si llega a hacer falta (ADR 0015), pero es otra decisión: con tamaño a la vista, con permiso y con una versión fija. Queda fuera.
- **IndexedDB.** Más espacio, pero API asíncrona y más código en el arranque; la lista de un pueblo cabe holgada en `localStorage`.
- **Guardar la lista, mostrarla sin señal con su hora, y mostrar la misma en la página `/offline`.** Elegida.

## Decisión

- **Cada lista que llega se guarda** en `localStorage` (`veni:restaurants`): la lista tal como la usa la app, con la hora en que llegó (reloj del dispositivo), el idioma de sus categorías y una versión de formato. Una lista nueva reemplaza a la anterior; si el servidor responde que no hay restaurantes, se borra. Un tope de 400.000 caracteres: si lo supera, o el almacenamiento no deja escribir, no se guarda y **la anterior también se borra** (una copia que ya no se puede reemplazar es peor que ninguna). «Borrar todo lo guardado» (ADR 0032) la incluye.
- **Idioma de la copia.** Cada lista se guarda con el idioma en que se pidió (no el que tenga la interfaz al terminar). Si la copia está en otro idioma que la interfaz, la lista y el mapa se usan pero sin categorías ni almuerzo (vendrían en el idioma equivocado); la página `/offline` hace lo mismo y muestra solo los nombres.
- **Vence a los 14 días.** Un restaurante que se ocultó o cerró no debe seguir a la vista para siempre; pasado el plazo, o con una hora del futuro (el reloj se movió), la copia se descarta y se ve el error de siempre.
- **Solo datos públicos.** Son los mismos de `/api/restaurants.geojson`; nunca se guarda la ubicación de la persona ni nada suyo (reglas 2 y 3). El pedido y la lista de favoritos viven aparte, como antes.
- **Sin lista a la vista y sin señal**, el inicio usa la guardada, con `ready` en vez de `error`, y muestra `StaleNotice`: «Sin señal: datos de hace 2 horas» con «Reintentar». Es contenido, no un control flotante: va sólido, sobre el mapa, bajo la fila de controles, y es un estado (`role="status"`), no una alerta. Con la señal de vuelta (al reintentar o al volver a la pestaña, pasado el minuto) llega la lista de verdad y el aviso se va solo. Si ya hay una lista de ahora a la vista y el pedido siguiente falla, no se cambia por la guardada: se queda la que se ve, como antes.
- **El módulo baja aparte.** `savedList.ts` se importa con `import()` (al llegar una lista y al hacer falta la última), no pesa en el arranque; el aviso baja con los demás componentes del inicio (`links.ts`). `bundle.test.ts` mide el arranque: la lógica mínima (`staleSince` y qué hacer si el pedido falla) no se pudo sacar y dejó el arranque en 82,994 kB (83,006 en CI), sin margen. El tope se subió a 83,5 kB y enseguida se revirtió: el ADR 0047 sacó de la entrada lo que Vení no usa de Inertia y de Vue, y el tope quedó en 76 kB. La copia no depende de `api.ts`: guarda la lista ya procesada y pide a mano los campos sin los que el mapa y la lista fallarían (la versión del formato descarta una copia de otra versión).
- **La página `/offline` también la muestra.** Si hay una copia vigente, `offline.ts` (script clásico, sin imports: repite la clave y la vigencia) pinta debajo del aviso «Restaurantes guardados en tu teléfono · Datos de hace 2 horas» con los nombres y sus categorías, como texto (`textContent`: nada de lo guardado se interpreta como HTML). Sin enlaces: el HTML de las fichas no se guarda, así que un enlace sin señal llevaría a la misma pantalla. Sin copia (o vencida, o rota), la página queda como antes.
- **Sin mapa de fondo, a propósito.** Sin mosaicos, el inicio muestra el mapa vacío con los marcadores; eso ya lo hacía MapLibre cuando el estilo no baja (`status: 'error'`, #55). La lista y el panel son lo que sirve. Si hace falta un mapa sin señal, es la descarga explícita de arriba.

## Consecuencias

- Una persona que abre la app sin señal ve restaurantes, con su hora, y no un mapa vacío; la lista puede tener hasta 14 días: el aviso lo dice siempre, con «hace …».
- La copia ocupa unos pocos kilobytes del `localStorage` del origen (el tope es 400.000 caracteres) y se borra con los datos del sitio; el aviso sobre lo que guarda la app en el dispositivo (política de datos) debe mencionarla: es la lista pública de restaurantes, sin datos de la persona.
- `useRestaurants` devuelve `staleSince`; `Home` lo muestra y no cambia nada más. Tres textos nuevos: `restaurants.stale`, `offline.saved_title` y `offline.saved_ago`.
- La página sin conexión pesa un poco más (se compara con el tope de 1 kB comprimido de `bundle.test.ts`) y su revisión en el precache cambia (la vista y `lang/` entran en el hash).
- Probado con la red y el almacenamiento de mentira, y en el navegador con la red cortada; no en un teléfono real sin señal.
