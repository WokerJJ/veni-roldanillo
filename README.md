<p align="center">
  <img src="brand/logo/veni-roldanillo.svg" alt="Vení Roldanillo" width="320">
</p>

<p align="center"><strong>Vení, comamos en Roldanillo</strong> · <em>Come eat in Roldanillo</em></p>

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
docker compose run --rm app php artisan key:generate   # instala las dependencias la primera vez
docker compose up -d
docker compose exec app php artisan migrate
```

La app queda en <http://localhost:8000>. PostgreSQL + PostGIS se publica en `127.0.0.1:5433` y Meilisearch en `127.0.0.1:7700`. La clave va antes de `up` porque Octane carga el cifrado al arrancar. Pruebas: `docker compose exec app php artisan test`.

Las pruebas usan la base `veni_test` (PostgreSQL + PostGIS), que se crea sola al inicializar el volumen de `db`. Si el volumen ya existía, creala una vez (es idempotente):

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/20-veni-test.sh
```

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

## Autor

**Jhon Hucker Chalarca Ramírez (Woker)** · Roldanillo, Valle del Cauca
[GitHub](https://github.com/WokerJJ) · [LinkedIn](https://linkedin.com/in/jhonhucker) · [Portafolio](https://wokerjj.github.io/portafolio)

## Licencia

Código propietario. Todos los derechos reservados. Ver [LICENSE](LICENSE).
