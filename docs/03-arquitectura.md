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

## Modelo de datos inicial (borrador)

| Entidad | Campos principales |
| --- | --- |
| `restaurants` | name, slug, category_id, description_es/en, address, reference, location (geography point), phone, whatsapp, price_level, delivery (bool), delivery_notes, payment_methods (json), status (unclaimed/claimed/hidden), plan (free/featured), verified_at, updated_by_owner_at |
| `opening_hours` | restaurant_id, weekday, opens_at, closes_at |
| `special_hours` | restaurant_id, date, opens_at, closes_at, closed (bool), note |
| `menu_sections` | restaurant_id, name_es/en, position |
| `dishes` | restaurant_id, menu_section_id, name_es/en, description_es/en, price, photo, tags (json), available (bool), sold_out_until (date) |
| `option_groups` | dish_id, name_es/en, required (bool), min, max |
| `options` | option_group_id, name_es/en, price_delta |
| `daily_menus` | restaurant_id, date, description_es/en, price |
| `promotions` | restaurant_id, title_es/en, starts_at, ends_at |
| `delivery_zones` | restaurant_id, neighborhood_id, fee |
| `neighborhoods` | name, area (geography polygon) |
| `users` | phone (verificado), alias, locale, role, trust_score |
| `restaurant_user` | restaurant_id, user_id, role (owner/staff) |
| `order_intents` | restaurant_id, user_id (nullable), device_hash, created_at, confirmed (null/yes/no) |
| `reviews` | restaurant_id, user_id, rating, tags (json), body, photo, verification (order/visit/nfc/none), weight, status (published/held/removed), locale |
| `dish_votes` | review_id, dish_id, vote (+1/-1) |
| `review_replies` | review_id, user_id, body |
| `private_feedback` | review_id, body |
| `nfc_tags` | restaurant_id, uid, key_ref, last_counter |
| `visits` | user_id, restaurant_id, method (gps/nfc), verified (bool), created_at — sin coordenadas |
| `audit log` | spatie/laravel-activitylog |

Nota: `order_intents` no guarda direcciones ni contenido del pedido; solo que hubo intención de pedir.
