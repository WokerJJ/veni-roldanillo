# Arquitectura

## Servicios (Docker Compose)

| Servicio | Imagen / rol |
| --- | --- |
| `app` | Laravel 13 en FrankenPHP + Octane; HTTPS automático (Caddy) en producción |
| `worker` | Misma imagen: `php artisan queue:work` (notificaciones, imágenes, traducciones) |
| `scheduler` | Misma imagen: `php artisan schedule:work` (backups, recordatorios, reactivar "agotado hoy") |
| `db` | `postgis/postgis` (PostgreSQL + PostGIS), sin puerto expuesto a internet |
| `meilisearch` | Búsqueda de restaurantes y platos |
| `reverb` (opcional) | Tiempo real para avisos de demora, driver de base de datos |

Una sola imagen para app, worker y scheduler. Dockerfile multi-etapa: Node (Vite) → Composer (sin dev) → runtime mínimo.

## CI/CD (GitHub Actions)

1. Calidad: Pest, Larastan, Pint, ESLint, vue-tsc.
2. Build de la imagen y publicación en GitHub Container Registry (ghcr.io).
3. Despliegue por SSH: `docker compose pull && docker compose up -d && php artisan migrate --force`.

## Servidor

VPS 2 vCPU / 4 GB, Ubuntu LTS, SSH solo con llaves, UFW (80/443), fail2ban, actualizaciones automáticas. Cloudflare delante (DNS, CDN, protección). Backups: `pg_dump` diario a Cloudflare R2 + snapshots semanales; restauración probada mensualmente. Monitoreo: Sentry, healthchecks de Docker, UptimeRobot.

## Mapa autohospedado

El mapa base lo produce y publica el repositorio [veni-mapa](https://github.com/WokerJJ/veni-mapa) (ADR 0007): PMTiles de Roldanillo, estilos `veni-{claro,oscuro}-{es,en}.json` con la marca, fuentes, sprites y el grafo de rutas `roldanillo-rutas.json`, en releases versionadas con SHA-256.

1. La app lo consume por `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`, fijados a una versión (hoy **v0.2.0**; en producción, `tiles.veniroldanillo.co` en Cloudflare R2 con CORS limitado al dominio).
2. MapLibre y PMTiles se cargan solo en las pantallas con mapa (carga perezosa). Tema e idioma los elige la app; el mapa no trae botones propios.
3. Restaurantes como capa GeoJSON desde la API.
4. Ubicación y rutas en el dispositivo (ADR 0008): la posición nunca sale del teléfono ni queda en la URL; el grafo se descarga al pedir la primera ruta.
5. Atribución obligatoria: "© colaboradores de OpenStreetMap" (ODbL), sin ocultar el control.

## Geolocalización

- API Geolocation del navegador (PWA) y plugin de Capacitor (fase 2).
- PostGIS: `ST_DWithin` para cercanía y verificación de visita; polígonos de zonas de domicilio por barrio.
- Turf.js en el cliente para calcular zona de domicilio.
- Sin geocodificación de pago: el dueño ubica su pin; el usuario elige barrio de una lista.

## Modelo de datos

Implementado en la Fase 0 (#6); decisiones en el ADR 0009. Convenciones: precios en pesos colombianos enteros (sin decimales, `CHECK >= 0`); fechas `timestamp with time zone` (la sesión de PostgreSQL usa la zona de la aplicación); estados como `varchar` con `CHECK` y enums PHP en los modelos; campos traducibles `_es` (obligatorio) y `_en` (opcional); `is_fictitious` marca los datos de ejemplo.

| Tabla | Campos principales | Restricciones e índices |
| --- | --- | --- |
| `categories` | slug, name_es/en, position | slug único con formato |
| `neighborhoods` | name, slug, area (geography MultiPolygon, opcional), is_fictitious | name y slug únicos; GiST en area |
| `restaurants` | name, slug, category_id, description_es/en, address, reference, location (geography Point 4326), phone, whatsapp, price_level, delivery, delivery_notes_es/en, payment_methods (jsonb), status (unclaimed/claimed/hidden), plan (free/featured), verified_at, updated_by_owner_at, is_fictitious | slug único con formato; GiST en location; índices en status y (category_id, status); whatsapp solo dígitos; price_level 1-4; categoría con `RESTRICT` |
| `restaurant_user` | restaurant_id, user_id, role (owner/staff) | PK compuesta; cascada |
| `opening_hours` | restaurant_id, weekday (0 = domingo), opens_at, closes_at | varias franjas por día; puede pasar la medianoche |
| `special_hours` | restaurant_id, on_date, closed, opens_at, closes_at, note_es/en | cerrado sin horas o abierto con ambas |
| `menu_sections` | restaurant_id, name_es/en, position | |
| `dishes` | restaurant_id, menu_section_id, name_es/en, description_es/en, price, photo_path, tags (jsonb), available, sold_out_until, position | FK compuesta (sección del mismo restaurante) |
| `option_groups` | dish_id, name_es/en, required, min_choices, max_choices, position | obligatorio si y solo si min_choices >= 1; max >= min |
| `options` | option_group_id, name_es/en, price_delta, available, position | price_delta >= 0 |
| `daily_menus` | restaurant_id, served_on, description_es/en, price | único por restaurante y fecha; índice en served_on |
| `promotions` | restaurant_id, title_es/en, starts_at, ends_at | ends_at > starts_at |
| `delivery_zones` | restaurant_id, neighborhood_id, fee | único por restaurante y barrio; barrio con `RESTRICT` |
| `restaurant_claims` | restaurant_id, user_id, status (pending/approved/rejected), message, reviewed_by, reviewed_at | una pendiente por usuario y restaurante; resuelta si y solo si tiene reviewed_at |
| `order_intents` | restaurant_id, user_id (nullable), device_hash, confirmed (null/sí/no), created_at | sin direcciones, contenido del pedido ni ubicación; al borrar el usuario queda anónima |
| `users` | + role (user/admin), locale (es/en) | ser dueño o empleado va en `restaurant_user` |

Autorización: `RestaurantPolicy` (el dueño solo edita el suyo; el administrador todo; borrar solo el administrador).

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
