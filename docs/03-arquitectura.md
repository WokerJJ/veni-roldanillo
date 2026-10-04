# Arquitectura

## Servicios (Docker Compose)

| Servicio | Imagen / rol |
| --- | --- |
| `migrate` | Misma imagen, una sola ejecución en cada `docker compose up`: `php artisan migrate --force`. `app`, `worker` y `scheduler` esperan a que termine bien |
| `app` | Laravel 13 en FrankenPHP: Octane en producción; modo clásico en desarrollo (ADR 0012). HTTP en `127.0.0.1:8000`, detrás del proxy que termina TLS (ADR 0014) |
| `worker` | Misma imagen: `php artisan queue:work` (notificaciones, imágenes, traducciones) |
| `scheduler` | Misma imagen: `php artisan schedule:work` (backups, recordatorios, reactivar "agotado hoy") |
| `db` | `postgis/postgis` (PostgreSQL + PostGIS), sin puerto expuesto a internet |
| `meilisearch` | Búsqueda de restaurantes y platos |
| `reverb` (opcional) | Tiempo real para avisos de demora, driver de base de datos |

Una sola imagen para migrate, app, worker y scheduler. Dockerfile multi-etapa: Node (Vite) → Composer (sin dev) → runtime mínimo, sin el `.env` y con un usuario sin root.

Al arrancar, la entrada de la imagen de producción (`docker/entrypoint-prod.sh`) lee el `.env` montado, guarda en caché configuración, eventos, rutas y vistas (`php artisan optimize`) y enlaza `public/storage`; después ejecuta el comando del servicio. No se hace al construir la imagen porque la caché de configuración dejaría escritos en ella los valores del `.env`.

Revisiones de salud: `app` responde `/up` (que también consulta la base); `db` responde por TCP, no por el socket, para no darse por lista mientras la imagen de PostGIS todavía inicializa el volumen; `worker` y `scheduler` comprueban que su proceso principal (PID 1) sea `php` corriendo `queue:work` o `schedule:work`, y no la entrada, que es un shell con ese mismo comando en sus argumentos mientras prepara Laravel. Para estos dos basta con que el proceso siga vivo: `queue:work` termina solo cuando un trabajo pasa de su tiempo límite, pierde la conexión con la base, se pasa de memoria o cumple `--max-time`, y `restart: unless-stopped` lo relanza. Una señal de vida escrita por el worker en cada vuelta detectaría además un proceso colgado, pero daría falsas alarmas en modo de mantenimiento (ahí el worker no da vueltas) y Compose tampoco reinicia un contenedor por estar «unhealthy».

## CI/CD (GitHub Actions)

1. Calidad (`ci.yml`): Pest, Larastan, Pint, ESLint, vue-tsc, y la prueba de humo de la imagen de producción: la levanta bajo Octane con PostGIS, espera `/up`, comprueba la migración y pide el inicio alternando idioma para ver que una petición no deja estado para la siguiente.
2. Imagen (`docker.yml`): construye la etapa `prod` y la publica en GitHub Container Registry (`ghcr.io/wokerjj/veni-roldanillo`) solo desde `main` y desde los tags de release.
3. Releases (`release.yml`): release-please calcula la versión y el `CHANGELOG.md` desde los commits convencionales; al fusionar su PR crea el tag, la release y la imagen de esa versión.
4. Despliegue (`deploy.yml`, preparado y desactivado): a mano y por versión, entra por SSH y ejecuta `docker compose pull` y `docker compose up -d`; el servicio `migrate` aplica las migraciones antes de que arranque la app y al final se comprueba `/up`.

El detalle, los secrets (hoy no existe ninguno) y cómo activarlo están en [Entrega y despliegue](despliegue.md); la decisión, en el ADR 0013.

## Servidor

VPS 2 vCPU / 4 GB, Ubuntu LTS, SSH solo con llaves, UFW (80/443), fail2ban, actualizaciones automáticas. Cloudflare delante (DNS, CDN, protección). TLS termina en un proxy delante de la app (Caddy en el servidor o un túnel de Cloudflare), en el que la app confía por `TRUSTED_PROXIES` (ADR 0014). Backups: `pg_dump` diario a Cloudflare R2 + snapshots semanales; restauración probada mensualmente. Monitoreo: Sentry, healthchecks de Docker, UptimeRobot.

## Mapa autohospedado

El mapa base lo produce y publica el repositorio [veni-mapa](https://github.com/WokerJJ/veni-mapa) (ADR 0007): PMTiles de Roldanillo, estilos `veni-{claro,oscuro}-{es,en}.json` con la marca, fuentes, sprites y el grafo de rutas `roldanillo-rutas.json`, en releases versionadas con SHA-256.

1. La app lo consume por `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`. Hoy apuntan a la demo pública de veni-mapa, que sigue su rama `main` y **no es una versión fija**: el ADR 0007 la tolera mientras no haya hosting versionado. En producción irán a una release fija en `tiles.veniroldanillo.co` (Cloudflare R2 con CORS limitado al dominio): el día que se definan las variables del repositorio, `docker.yml` exige que apunten a `…/vX.Y.Z/…` (ver [Entrega y despliegue](despliegue.md#el-mapa-dentro-de-la-imagen)). `VITE_MAP_STYLE_URL` es una plantilla, `…/veni-{theme}-{locale}.json`: la app pone `claro` u `oscuro` y `es` o `en`; sin alguno de los dos marcadores `vite build` se detiene y `vite` avisa. Las dos se fijan al compilar los assets (en la imagen de producción, como argumentos de build con la demo pública por defecto).
2. MapLibre y PMTiles se cargan solo en las pantallas con mapa (carga perezosa): el componente `MapView` importa el motor (`resources/js/map/engine.ts`) con `import()` al montarse y pide el estilo a la vez, sin esperar a que baje; la vista raíz adelanta la conexión con el host del mapa (`<link rel="preconnect">`). Una prueba que compila el frontend (`resources/js/map/bundle.test.ts`) falla si MapLibre llega al bundle inicial, si el worker deja de poder cargarse o si lo que se descarga pasa del presupuesto (comprimido con gzip). El mapa se deja ver en cuanto empieza a pintar; si en 20 s no empieza, o si fallan la fuente de los tiles o el worker, muestra el error con «Reintentar». Tema e idioma los elige la app, que cambia de estilo sin mover la cámara; el mapa no trae botones propios, solo los de zoom y la atribución. La cámara inicial y los límites salen del estilo (`center`, `zoom` y `metadata["veni:bounds"]`).
3. Restaurantes como capa GeoJSON desde la API.
4. Ubicación y rutas en el dispositivo (ADR 0008): la posición nunca sale del teléfono ni queda en la URL; el grafo se descarga al pedir la primera ruta.
5. Atribución obligatoria: "© colaboradores de OpenStreetMap" (ODbL), sin ocultar el control. Sus enlaces miden unos 20 px de alto, menos que los 44 px de las áreas táctiles de la app: son enlaces dentro de una línea de texto, la excepción «en línea» del criterio 2.5.8 de WCAG 2.2 (tamaño del objetivo), y agrandarlos taparía el mapa. Los botones de zoom sí miden 44 px.

Para la política de seguridad de contenido (ADR 0014): el navegador pide con `fetch` el estilo, los tiles, las fuentes, los sprites y el grafo de rutas al host del mapa (`connect-src`, también en `img-src`); la CSP toma ese host de `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`, que la imagen de producción guarda en su entorno. El worker de MapLibre se sirve desde el mismo origen de la app (`worker-src 'self'`); en desarrollo sale del servidor de Vite y MapLibre lo arranca desde una URL `blob:`. Los íconos de los controles van en el CSS como `data:` y, en navegadores sin `createImageBitmap`, los sprites se arman con una URL `blob:` (`img-src`).

## App instalable y caché (PWA)

La app se instala desde el navegador y abre sin señal con una página propia (#5). Regla 8 de producto: tiene que servir con datos móviles y mala señal, así que el service worker guarda lo que no cambia y nunca guarda lo que depende de la persona.

### Manifest

`/manifest.webmanifest` lo sirve Laravel (`WebManifestController`, `App\Support\WebApp`), no un archivo del build: los colores salen de `brand/tokens.json` y la descripción de `lang/es.json`, sin copiarlos. Va sin el grupo `web`: el navegador lo pide sin cookies y abriría una sesión en cada visita. Está en español, el idioma por defecto, porque el navegador no manda la cookie del idioma y el dispositivo lo guarda al instalar. `theme_color` y `background_color` son el fondo de la cabecera en claro (blanco); la vista raíz pone además `<meta name="theme-color">` para claro y oscuro, y `useTheme` los ajusta si en la app rige otro tema que el del sistema. Los íconos (192, 512 y el maskable de 512) y el de iOS se copian de `brand/png` a `public/build/icons` al compilar (`copyBrandIcons` en `vite.config.ts`), sin una segunda copia en git.

### Service worker

`vite-plugin-pwa` con **generateSW**: Workbox arma el service worker desde la configuración de `vite.config.ts`. Alcanza porque todo lo que hace falta es declarativo (rutas, estrategias, límites y la página de respaldo); con injectManifest habría un service worker propio que mantener y probar aparte. Queda en `public/sw.js`, en la raíz, así su alcance es todo el sitio sin `Service-Worker-Allowed`, y lleva el runtime de Workbox adentro (un solo archivo, unos 8 kB comprimidos). Caddy lo sirve con `Cache-Control: no-cache` (`config/octane.php`), para que ni el navegador ni un CDN delante retengan una versión vieja.

Lo registra el bundle (`resources/js/pwa/serviceWorker.ts`), sin script en línea: la CSP solo deja correr scripts de este origen o con nonce, y `worker-src 'self'` ya deja registrar `/sw.js` ([ADR 0014](adr/0014-seguridad-http-detras-del-proxy.md)). Solo en el build de producción y después del evento `load`, para no competir con la primera carga; `workbox-window` es un chunk aparte que baja recién entonces.

**Versiones nuevas.** Una versión nueva del service worker queda esperando y la app avisa abajo, en una región de estado: «Hay una versión nueva de Vení · Actualizar», con «Ahora no». No se activa sola: hacerlo recargaría la página en medio de un pedido, y la versión vieja sigue funcionando con su precache. «Actualizar» la activa y recarga cuando toma el control; si nadie la acepta, se activa cuando se cierran todas las pestañas de la app. Mientras tanto, si el despliegue cambió los assets, Inertia ya recarga la página al ver otra versión del manifest de Vite, y esa navegación es la que hace que el navegador encuentre el `sw.js` nuevo.

### Qué se guarda y cómo

| Qué | Estrategia | Caché y límite | Por qué |
| --- | --- | --- | --- |
| El shell: entrada (`app.ts`), página de inicio, sus imports estáticos, CSS y logos, y la página sin conexión con su script y su estilo | Precache | `veni-precache-…`; 9 entradas, unos 74 kB comprimidos | Lo que baja al abrir la app. Con el hash en el nombre se pide tal cual: si la página acaba de bajarlo, sale de la caché del navegador sin volver a la red |
| Navegaciones (HTML) | Solo red; sin red, la página sin conexión del precache | Nada | El HTML depende de la cookie del idioma (ADR 0010), de la sesión y del token CSRF: guardarlo serviría una página de otra persona, de otro idioma o vencida. Con *navigation preload*, la petición sale mientras arranca el service worker |
| Lo demás de `/build/assets`: el mapa (MapLibre, PMTiles, el worker y su CSS), cada ícono, otras páginas | Cache first | `veni-assets`, 120 entradas, 60 días | Llevan el hash del contenido: nunca cambian. Se guardan la primera vez que se piden |
| Fuentes (`/fonts/*.woff2`) | Stale-while-revalidate | `veni-fonts`, 8 entradas | No llevan hash (EVA-004): no pueden ir a una caché que se tome como inmutable. Se usa la guardada y se revalida detrás, con el ETag que da Caddy |
| Estilos, glyphs y sprites del mapa (`.json`, `.pbf`, `.png`, `.webp` del origen de `VITE_MAP_STYLE_URL`) | Stale-while-revalidate | `veni-map`, 60 entradas, 30 días | La demo de veni-mapa no es una versión fija (ADR 0007): se muestra lo guardado y se actualiza detrás. Una visita al mapa guarda unas 7 entradas |
| PMTiles y el grafo de rutas | No se guardan | — | Ver abajo |

El precache sale del directorio de build (`public/build/assets`) y el manifest de Vite solo dice cuáles de esos archivos son el shell (`resources/js/pwa/shellPrecache.ts`): en el manifest hay nombres que no son archivos (el worker del mapa queda en `assets` con el hash sin resolver). Si el shell nombra un archivo que no está en el build, la compilación falla: un precache con una URL que no existe deja al service worker sin instalarse. La página sin conexión no es un archivo del build: su versión en el precache es un hash de la vista, de `lang/*.json` y de los archivos del shell que nombra.

**Por qué el mapa no va en el precache.** Son unos 310 kB comprimidos. El precache se baja entero o no se instala: con mala señal, más peso es más instalaciones fallidas, y cada despliegue que cambie el motor lo volvería a bajar a todos. Sin red, además, el motor no sirve de nada sin los tiles. Como el inicio muestra el mapa, la primera visita ya lo baja y desde la segunda sale de `veni-assets`.

**Por qué el PMTiles no se guarda.** El mapa se pide por rangos (`Range`, respuestas 206) y la Cache API no guarda respuestas parciales. `RangeRequestsPlugin` de Workbox no lo resuelve: recorta respuestas de una copia **completa** ya guardada (el archivo de Roldanillo pesa 1,6 MB), y la biblioteca de PMTiles nunca pide el archivo entero, así que habría que bajarlo aparte, con datos móviles, sin que nadie lo pidiera. Con una URL que no es una versión fija, una copia guardada de una versión con los rangos nuevos de otra daría tiles rotos: PMTiles compara el ETag de cada respuesta y, si cambia, vuelve a pedir con `cache: 'reload'`, una indicación para la caché HTTP que una respuesta sacada de la Cache API no mira, así que seguiría recibiendo la copia vieja. Queda la caché HTTP del navegador. Si llega a hacer falta el mapa sin conexión, la forma es una descarga explícita («Descargar el mapa») de una release fija, con su tamaño a la vista. El grafo de rutas (más de 500 kB) se decide con las rutas (#10, #11).

### Sin conexión

Sin red, una navegación responde la página sin conexión (`/offline`, `resources/views/offline.blade.php`) en la misma URL. La arma Laravel, sin el grupo `web` (no depende de la sesión ni del idioma de la petición), con los textos de `lang/` en los dos idiomas y la política de seguridad de siempre; no trae nada en línea, así que la respuesta guardada no depende de su nonce, y nombra los archivos sin esquema ni host. Un script clásico en `<head>` (`resources/js/offline.ts`) elige el idioma antes de pintar: el último con que respondió el servidor en este dispositivo (`useI18n` lo deja en `localStorage`, `veni:locale`) o, si no hay, el primero del teléfono que la app tenga; aplica el tema guardado (`veni:theme`) y recarga la página sola cuando vuelve la señal.

Cambiar de idioma exige red (ADR 0010): los textos del otro idioma vienen del servidor. Sin conexión, o si `PUT /locale` no llega, el selector avisa en una región de estado en vez de fallar en silencio.

## Geolocalización

- API Geolocation del navegador (PWA) y plugin de Capacitor (fase 2).
- PostGIS: `ST_DWithin` para cercanía y verificación de visita; polígonos de zonas de domicilio por barrio.
- Turf.js en el cliente para calcular zona de domicilio.
- Sin geocodificación de pago: el dueño ubica su pin; el usuario elige barrio de una lista.

## Modelo de datos

Implementado en la Fase 0 (#6); decisiones en el ADR 0009. Convenciones: precios en pesos colombianos enteros (sin decimales, `CHECK >= 0`); fechas `timestamp with time zone` (la sesión de PostgreSQL usa la zona de la aplicación); estados como `varchar` con `CHECK` y enums PHP en los modelos; campos traducibles `_es` (obligatorio) y `_en` (opcional); `is_fictitious` marca los datos de ejemplo. La primera migración crea las extensiones `postgis` y `btree_gist` (el usuario de la base necesita permiso para crearlas; ver el README).

| Tabla | Campos principales | Restricciones e índices |
| --- | --- | --- |
| `categories` | slug, name_es/en, position | slug único con formato |
| `category_restaurant` | category_id, restaurant_id | un restaurante puede tener varias categorías; PK (category_id, restaurant_id) e índice en restaurant_id; categoría en uso con `RESTRICT`, restaurante en cascada |
| `neighborhoods` | name, slug, area (geography MultiPolygon, opcional), is_fictitious | name y slug únicos; GiST en area |
| `restaurants` | name, slug, description_es/en, address, reference, location (geography Point 4326), phone, whatsapp, price_level, delivery, delivery_notes_es/en, payment_methods (jsonb, lista del enum `PaymentMethod`: cash/nequi/daviplata/card), status (unclaimed/claimed/hidden), plan (free/featured), verified_at, updated_by_owner_at, is_fictitious | slug único con formato; GiST en location; sin índice en status (el filtro `status <> 'hidden'` no lo usa); whatsapp celular colombiano `57` + diez dígitos (el modelo normaliza «+57 300 …»); price_level 1-4; payment_methods solo con valores del enum |
| `restaurant_user` | restaurant_id, user_id, role (owner/staff) | PK compuesta; cascada |
| `opening_hours` | restaurant_id, weekday (0 = domingo), opens_at, closes_at | varias franjas por día sin solaparse (`EXCLUDE` con GiST); una franja puede pasar la medianoche |
| `special_hours` | restaurant_id, on_date, closed, opens_at, closes_at, note_es/en | cerrado sin horas o abierto con ambas; por fecha, o un solo «cerrado» o franjas que no se solapan (`EXCLUDE`) |
| `menu_sections` | restaurant_id, name_es/en, position | |
| `dishes` | restaurant_id, menu_section_id, name_es/en, description_es/en, price, photo_path, tags (jsonb), available, sold_out_until, position | FK compuesta (sección del mismo restaurante) |
| `option_groups` | dish_id, name_es/en, required, min_choices, max_choices, position | obligatorio si y solo si min_choices >= 1; max >= min |
| `options` | option_group_id, name_es/en, price_delta, available, position | price_delta >= 0 |
| `daily_menus` | restaurant_id, served_on, description_es/en, price | único por restaurante y fecha; índice en served_on |
| `promotions` | restaurant_id, title_es/en, starts_at, ends_at | ends_at > starts_at |
| `delivery_zones` | restaurant_id, neighborhood_id, fee | único por restaurante y barrio; barrio con `RESTRICT`. Las zonas mandan sobre `restaurants.delivery`: con zonas, el restaurante lleva a esos barrios con ese costo; `delivery` solo indica que hace domicilios mientras no haya zonas cargadas |
| `restaurant_claims` | restaurant_id, user_id, status (pending/approved/rejected), message, reviewed_by, reviewed_at | una pendiente por usuario y restaurante; resuelta si y solo si tiene reviewed_at; índices en restaurant_id, user_id y reviewed_by |
| `order_intents` | restaurant_id, user_id (nullable), device_hash, confirmed (null/sí/no), created_at | sin direcciones, contenido del pedido ni ubicación; al borrar el usuario queda anónima (un trigger borra también device_hash) |
| `users` | + role (user/admin), locale (es/en o nulo: decide el dispositivo, ADR 0010) | ser dueño o empleado va en `restaurant_user` |

Autorización: `RestaurantPolicy` (el dueño solo edita el suyo; el administrador todo; borrar solo el administrador). El contenido del restaurante (secciones, platos, grupos de opciones, opciones, almuerzos del día, promociones, horarios, horarios especiales y zonas) usa `RestaurantContentPolicy`, que delega en `RestaurantPolicy` a través de `BelongsToRestaurant::owningRestaurant()`; crear recibe el restaurante de la ruta. Los platos se crean con `$restaurant->dishes()->create()` (`restaurant_id` no es asignable). Menús y opciones se ordenan por `position` y luego `id`.

### Pendiente para fases posteriores

| Tabla | Campos principales | Cuándo |
| --- | --- | --- |
| `users` | phone (verificado), alias, trust_score | acceso por código de WhatsApp y reseñas |
| `reviews` | restaurant_id, user_id, rating, tags (json), body, photo, verification (order/visit/nfc/none), weight, status (published/held/removed), locale | reseñas verificadas (ADR 0005) |
| `dish_votes` | review_id, dish_id, vote (+1/-1) | reseñas |
| `review_replies` | review_id, user_id, body | reseñas |
| `private_feedback` | review_id, body | reseñas |
| `nfc_tags` | restaurant_id, uid, key_ref, last_counter | verificación por NFC |
| `visits` | user_id, restaurant_id, method (gps/nfc), verified (bool), created_at — sin coordenadas | verificación de visitas |
| `audit log` | spatie/laravel-activitylog | paneles de dueño y administración |
