# Arquitectura

## Servicios (Docker Compose)

| Servicio | Imagen / rol |
| --- | --- |
| `migrate` | Misma imagen, una sola ejecución en cada `docker compose up`: `php artisan migrate --force`. `app`, `worker` y `scheduler` esperan a que termine bien |
| `app` | Laravel 13 en FrankenPHP: Octane en producción; modo clásico en desarrollo (ADR 0012). HTTPS automático (Caddy) en producción |
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

VPS 2 vCPU / 4 GB, Ubuntu LTS, SSH solo con llaves, UFW (80/443), fail2ban, actualizaciones automáticas. Cloudflare delante (DNS, CDN, protección). Backups: `pg_dump` diario a Cloudflare R2 + snapshots semanales; restauración probada mensualmente. Monitoreo: Sentry, healthchecks de Docker, UptimeRobot.

## Mapa autohospedado

El mapa base lo produce y publica el repositorio [veni-mapa](https://github.com/WokerJJ/veni-mapa) (ADR 0007): PMTiles de Roldanillo, estilos `veni-{claro,oscuro}-{es,en}.json` con la marca, fuentes, sprites y el grafo de rutas `roldanillo-rutas.json`, en releases versionadas con SHA-256.

1. La app lo consume por `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`. Hoy apuntan a la demo pública de veni-mapa, que sigue su rama `main` y **no es una versión fija**: el ADR 0007 la tolera mientras no haya hosting versionado. En producción irán a una release fija en `tiles.veniroldanillo.co` (Cloudflare R2 con CORS limitado al dominio): el día que se definan las variables del repositorio, `docker.yml` exige que apunten a `…/vX.Y.Z/…` (ver [Entrega y despliegue](despliegue.md#el-mapa-dentro-de-la-imagen)). `VITE_MAP_STYLE_URL` es una plantilla, `…/veni-{theme}-{locale}.json`: la app pone `claro` u `oscuro` y `es` o `en`; sin alguno de los dos marcadores `vite build` se detiene y `vite` avisa. Las dos se fijan al compilar los assets (en la imagen de producción, como argumentos de build con la demo pública por defecto).
2. MapLibre y PMTiles se cargan solo en las pantallas con mapa (carga perezosa): el componente `MapView` importa el motor (`resources/js/map/engine.ts`) con `import()` al montarse y pide el estilo a la vez, sin esperar a que baje; la vista raíz adelanta la conexión con el host del mapa (`<link rel="preconnect">`). Una prueba que compila el frontend (`resources/js/map/bundle.test.ts`) falla si MapLibre llega al bundle inicial, si el worker deja de poder cargarse o si lo que se descarga pasa del presupuesto (comprimido con gzip). El mapa se deja ver en cuanto empieza a pintar; si en 20 s no empieza, o si fallan la fuente de los tiles o el worker, muestra el error con «Reintentar». Tema e idioma los elige la app, que cambia de estilo sin mover la cámara; el mapa no trae botones propios, solo los de zoom y la atribución. La cámara inicial y los límites salen del estilo (`center`, `zoom` y `metadata["veni:bounds"]`).
3. Restaurantes como capa GeoJSON desde la API.
4. Ubicación y rutas en el dispositivo (ADR 0008): la posición nunca sale del teléfono ni queda en la URL; el grafo se descarga al pedir la primera ruta.
5. Atribución obligatoria: "© colaboradores de OpenStreetMap" (ODbL), sin ocultar el control. Sus enlaces miden unos 20 px de alto, menos que los 44 px de las áreas táctiles de la app: son enlaces dentro de una línea de texto, la excepción «en línea» del criterio 2.5.8 de WCAG 2.2 (tamaño del objetivo), y agrandarlos taparía el mapa. Los botones de zoom sí miden 44 px.

Para la política de seguridad de contenido (pendiente, #41): el navegador pide con `fetch` el estilo, los tiles, las fuentes y los sprites al host del mapa (`connect-src`), el worker de MapLibre se sirve desde el mismo origen de la app (`worker-src 'self'`) y los íconos de los controles van en el CSS como `data:` (`img-src`).

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
