<p align="center">
  <img src="brand/logo/veni-roldanillo.svg" alt="Vení Roldanillo" width="320">
</p>

<p align="center"><strong>Vení, comamos en Roldanillo</strong> · <em>Come eat in Roldanillo</em></p>

<p align="center">
  <a href="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/ci.yml"><img src="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/security.yml"><img src="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/security.yml/badge.svg?branch=main" alt="Seguridad"></a>
</p>

Plataforma web instalable (PWA), bilingüe español/inglés, que reúne a **todos los restaurantes de Roldanillo** (Valle del Cauca, Colombia) con menús, precios, mapa, horarios y calificaciones confiables, y permite **pedir a domicilio por WhatsApp sin comisiones** para el negocio.

> Estado: planeación terminada, desarrollo del MVP en curso. Dominio: `veniroldanillo.co`

## El problema

- Los residentes buscan dónde pedir en grupos de Facebook, entre publicaciones de otras ciudades y menús viejos sin precios.
- Los turistas del parapente y del Museo Rayo no encuentran información en inglés.
- Los restaurantes pierden pedidos por la conversación de ida y vuelta y pagan comisiones altas en las plataformas nacionales.

## Qué hace

| Para | Funciones |
| --- | --- |
| Residentes | Todos los restaurantes, búsqueda por plato, filtros, "Almuerzos de hoy", "Sugiéreme algo" |
| Turistas | Todo en inglés, guía de platos típicos, mapa, "Cómo llegar", medios de pago locales |
| Restaurantes | Ficha gratis, panel desde el celular (agotado hoy, promociones, horarios, aviso de demora), estadísticas |
| Todos | Pedido armado en la app y enviado por WhatsApp, reseñas verificadas por pedido, ubicación o NFC |

## Stack

| Capa | Tecnología |
| --- | --- |
| Backend | Laravel 13 · FrankenPHP/Octane · Filament |
| Frontend | Inertia · Vue 3 + TypeScript · Tailwind · PWA |
| Datos | PostgreSQL + PostGIS · Meilisearch |
| Mapas | MapLibre GL JS · PMTiles autohospedado (OpenStreetMap) |
| Infraestructura | Docker Compose · VPS · Cloudflare (DNS, CDN, R2) |
| Calidad | Pest · Larastan · Pint · GitHub Actions |

## Desarrollo local

Requisito: Docker con Docker Compose. PHP, Composer y PostgreSQL corren dentro de los contenedores.

```bash
cp .env.example .env
docker compose build
docker compose run --rm app php artisan key:generate   # la primera vez descarga las dependencias (medio minuto)
docker compose up -d
docker compose exec app php artisan migrate
```

La app queda en <http://localhost:8000>. PostgreSQL + PostGIS se publica en `127.0.0.1:5433` y Meilisearch en `127.0.0.1:7700`. Pruebas: `docker compose exec app php artisan test`.

### Dependencias de Composer

`vendor/` no está en la carpeta del proyecto: vive en un volumen de Docker (`veni-roldanillo_vendor`; el prefijo es el nombre de la carpeta). Leer sus más de 10 000 archivos a través del montaje de Docker Desktop hacía que cada petición tardara segundos. El contenedor instala las dependencias al arrancar si el volumen está vacío o si `composer.lock` cambió desde la última instalación, y Composer corre con el usuario del contenedor, sin `--user root`:

```bash
docker compose exec app composer require <paquete>      # agregar un paquete
docker compose restart                                   # tras un pull o un cambio de rama que toque composer.lock
docker compose exec app composer install                 # lo mismo, sin reiniciar
docker compose down                                      # empezar de cero: al borrar el volumen,
docker volume rm veni-roldanillo_vendor                  # el siguiente arranque reinstala todo
```

El editor no ve ese volumen. Si necesita `vendor/` para el autocompletado, se copia a la carpeta del proyecto (opcional, cerca de un minuto; repetilo cuando cambien las dependencias). El contenedor sigue usando el volumen, no la copia:

```bash
docker compose cp app:/app/vendor .
```

### Ver los cambios

En desarrollo FrankenPHP corre en modo clásico: cada petición arranca Laravel de nuevo, así que un cambio en PHP, rutas, configuración, vistas o `.env` se ve en la siguiente petición, sin reiniciar nada. El modo worker de Octane, que deja la aplicación arrancada en memoria, queda para la imagen de producción (`docker-compose.yml` sin el override).

`worker` sí es un proceso largo que carga el código una sola vez: tras cambiar un job, `docker compose restart worker`.

Las vistas compiladas y los registros de Inertia DevTools se guardan en memoria (`tmpfs`) y se pierden al recrear el contenedor.

### Base de datos

Las pruebas usan la base `veni_test` (PostgreSQL + PostGIS), que se crea sola al inicializar el volumen de `db`. Si el volumen ya existía, creala una vez (es idempotente):

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/20-veni-test.sh
```

La primera migración crea las extensiones `postgis` y `btree_gist` (`CREATE EXTENSION IF NOT EXISTS`), así que el usuario de la base necesita permiso para crear extensiones: en Docker lo tiene (es el superusuario de la imagen); en un servidor administrado, o se le da ese permiso o un administrador crea las dos extensiones antes de migrar. Al revertir, las extensiones se quedan: son de toda la base y pueden usarlas otros.

`php artisan db:seed` carga datos ficticios y solo corre con `APP_ENV` en `local` o `testing`; las cuentas sembradas (`@example.test`) tienen contraseñas aleatorias que no se muestran.

## Calidad

Los mismos comandos corren en GitHub Actions (`ci.yml`); el check `ci-ok` resume todos los jobs.

```bash
docker compose exec app composer lint      # Pint (preset laravel); `composer format` corrige
docker compose exec app composer analyse   # Larastan al nivel máximo
docker compose exec app composer test      # Pest sobre veni_test
npm run lint                               # ESLint
npm run typecheck                          # vue-tsc
npm test                                   # Vitest (incluye la verificación de los íconos)
npm run build
```

`security.yml` revisa cada semana y en cada PR los avisos de `composer audit`, `npm audit` (desde high) y los secretos del historial con gitleaks.

## Documentación

- [Visión y propuesta](docs/01-vision.md)
- [Producto y funcionalidades](docs/02-producto.md)
- [Arquitectura](docs/03-arquitectura.md)
- [Seguridad y marco legal](docs/04-seguridad-y-legal.md)
- [Roadmap y alcance del MVP](docs/05-roadmap.md)
- [Alineación con el Plan de Desarrollo Municipal](docs/06-plan-desarrollo-municipal.md)
- [Análisis de mercado](docs/07-mercado.md)
- [Decisiones de arquitectura (ADR)](docs/adr/)
- [Guía de marca](brand/README.md)

## Créditos

- **Íconos:** [colombia-icons](https://github.com/Mteheran/colombia-icons), licencia MIT, © Miguel Teheran. Los que usa la app están copiados en [`resources/icons/colombia`](resources/icons/colombia) desde una versión fija, con su licencia ([ADR 0011](docs/adr/0011-iconos-colombia-icons.md)).

## Autor

**Jhon Hucker Chalarca Ramírez (Woker)** · Roldanillo, Valle del Cauca
[GitHub](https://github.com/WokerJJ) · [LinkedIn](https://linkedin.com/in/jhonhucker) · [Portafolio](https://wokerjj.github.io/portafolio)

## Licencia

Código propietario. Todos los derechos reservados. Ver [LICENSE](LICENSE).
