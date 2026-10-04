<p align="center">
  <img src="brand/logo/veni-roldanillo.svg" alt="Vení Roldanillo" width="320">
</p>

<p align="center"><strong>Vení, comamos en Roldanillo</strong> · <em>Come eat in Roldanillo</em></p>

<p align="center">
  <a href="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/ci.yml"><img src="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/security.yml"><img src="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/security.yml/badge.svg?branch=main" alt="Seguridad"></a>
  <a href="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/docker.yml"><img src="https://github.com/WokerJJ/veni-roldanillo/actions/workflows/docker.yml/badge.svg?branch=main" alt="Imagen"></a>
  <a href="https://github.com/WokerJJ/veni-roldanillo/releases/latest"><img src="https://img.shields.io/github/v/release/WokerJJ/veni-roldanillo?label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-propietaria-lightgrey" alt="Licencia: propietaria"></a>
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

Requisitos: Docker con Docker Compose, y Node.js 24 para el frontend. PHP, Composer y PostgreSQL corren dentro de los contenedores.

```bash
cp .env.example .env
docker compose build
docker compose run --rm app php artisan key:generate   # la primera vez descarga las dependencias (medio minuto)
docker compose up -d                                   # migra antes de arrancar la app
npm ci
npm run build                                          # o `npm run dev` (ver «Frontend»)
```

La app queda en <http://localhost:8000>. PostgreSQL + PostGIS se publica en `127.0.0.1:5433` y Meilisearch en `127.0.0.1:7700`. Pruebas: `docker compose exec app php artisan test`.

Cada `docker compose up` corre primero el servicio `migrate` (`php artisan migrate --force`, una sola ejecución) y `app`, `worker` y `scheduler` esperan a que termine bien. Si una migración falla, ninguno arranca y `docker compose logs migrate` dice por qué. Con el entorno ya arriba, una migración nueva se aplica con `docker compose exec app php artisan migrate`.

### Frontend

Vite corre en el equipo, no en un contenedor:

```bash
npm ci
npm run dev      # servidor de Vite con recarga en caliente, mientras se trabaja en el frontend
npm run build    # o compilar una vez a public/build
```

Hace falta una de las dos. Sin `public/build/manifest.json` y sin el servidor de Vite, las páginas responden 500 («Vite manifest not found»), aunque `/up` siga en 200 y el contenedor aparezca sano.

Mientras `npm run dev` está abierto manda él: escribe `public/hot` y la app carga los recursos desde ese servidor aunque exista una compilación. Al cerrarlo borra el archivo; si se cierra a la fuerza y `public/hot` queda, la app sigue apuntando a un servidor que ya no existe: borrá el archivo o volvé a ejecutar `npm run dev`.

La política de seguridad de contenido (CSP, [ADR 0014](docs/adr/0014-seguridad-http-detras-del-proxy.md)) está activa también en desarrollo y deja pasar al servidor que nombra `public/hot` (`http://localhost:5173`: `vite.config.ts` fija `localhost` porque una CSP no puede nombrar `[::1]`). Si algo no carga, la consola del navegador dice qué bloqueó; con `CSP_REPORT_ONLY=true` en el `.env` solo lo informa, sin bloquear. Si una visita GET de Inertia falla, la página de depuración de Laravel se abre como página propia y no en el diálogo de Inertia, donde la CSP no deja leerla; la de una visita que manda datos se lee en la pestaña Red del navegador.

### Mapa

El mapa no vive en este repositorio: la app carga por URL el que publica [veni-mapa](https://github.com/WokerJJ/veni-mapa) ([ADR 0007](docs/adr/0007-mapa-desde-veni-mapa.md)). Dos variables del `.env` dicen de dónde:

| Variable | Qué es |
| --- | --- |
| `VITE_MAP_STYLE_URL` | Plantilla del estilo. La app cambia `{theme}` por `claro` u `oscuro` y `{locale}` por `es` o `en`, según el tema y el idioma de la interfaz: `https://…/veni-{theme}-{locale}.json`. |
| `VITE_MAP_ROUTES_URL` | Grafo de rutas (`roldanillo-rutas.json`), para calcularlas en el dispositivo ([ADR 0008](docs/adr/0008-ubicacion-y-rutas-en-el-dispositivo.md)). |

Los valores de `.env.example` apuntan a la demo pública de veni-mapa, que sigue su rama `main`: **no es una versión fija**, el mapa cambia cuando cambia la demo. El ADR 0007 la tolera mientras no haya un hosting versionado; cuando exista, la imagen publicada se fija a una release con dos variables del repositorio y `docker.yml` comprueba que lo sean ([Entrega y despliegue](docs/despliegue.md#el-mapa-dentro-de-la-imagen)).

> **Al actualizar:** si tu `.env` es anterior a los marcadores y trae una URL fija (`…/veni-claro-es.json`), cambiala por la plantilla de `.env.example`. Sin `{theme}` y `{locale}` el mapa se quedaría en un solo tema y un solo idioma sin que nada falle, así que `npm run build` se detiene con un mensaje que dice qué falta, y `npm run dev` avisa en la terminal y en la consola del navegador.

Vite las escribe en el JavaScript al compilar: tras cambiarlas hay que reiniciar `npm run dev` o repetir `npm run build`. Laravel las lee además (`config/services.php`) para que la vista raíz adelante la conexión con el host del mapa (`<link rel="preconnect">`) y para que la CSP deje pedirle el mapa; si no las encuentra, no pone el enlace y la CSP no abre ningún host. En la imagen de producción son argumentos de build con esos mismos valores por defecto, que la imagen guarda también en su entorno; para fijar una release se definen en el `.env` que lee `docker compose build` o se pasan con `--build-arg`:

```bash
docker build --target prod \
  --build-arg VITE_MAP_STYLE_URL='https://tiles.veniroldanillo.co/vX.Y.Z/veni-{theme}-{locale}.json' \
  --build-arg VITE_MAP_ROUTES_URL='https://tiles.veniroldanillo.co/vX.Y.Z/roldanillo-rutas.json' .
```

### Dependencias de Composer

`vendor/` no está en la carpeta del proyecto: vive en un volumen de Docker. Leer sus más de 10 000 archivos a través del montaje de Docker Desktop hacía que cada petición tardara segundos. El contenedor instala las dependencias al arrancar si el volumen está vacío o si lo instalado ya no corresponde a `composer.lock`. Composer corre con el usuario del contenedor, nunca con `--user root`: dejaría en el volumen archivos que ese usuario no puede actualizar, y el contenedor se niega a instalar como root.

```bash
docker compose exec app composer require <paquete>      # agregar un paquete
docker compose restart app worker scheduler              # tras un pull o un cambio de rama que toque composer.lock
```

`docker compose exec app composer install` también instala, pero por fuera del arranque: no actualiza el sello de la última instalación (el siguiente arranque repite `composer install`) ni reinicia `worker` y `scheduler`, que son procesos largos y siguen con lo que cargaron al arrancar. Lo indicado es el `restart`.

Si `composer install` falla al arrancar (sin red, por ejemplo), el contenedor no arranca y `docker compose logs app` dice por qué. Para entrar igual:

```bash
docker compose run --rm -e VENI_SKIP_INSTALL=1 app <comando>   # ejecuta el comando sin revisar ni instalar
docker compose run --rm --entrypoint sh app                    # una consola sin pasar por la entrada del contenedor
```

Para empezar de cero se borra el volumen y el siguiente arranque reinstala todo. Se llama `<proyecto>_vendor`, donde `<proyecto>` es el nombre del proyecto de Compose (por defecto el de la carpeta; lo muestra `docker compose ls`). Las descargas de Composer quedan en otro volumen (`composer_cache`), así que no se bajan de nuevo.

```bash
docker compose down
docker volume ls -q -f label=com.docker.compose.volume=vendor   # el nombre exacto del volumen
docker volume rm <nombre>
```

El editor no ve ese volumen. Si necesita `vendor/` para el autocompletado, se copia a la carpeta del proyecto (opcional, cerca de un minuto; repetilo cuando cambien las dependencias). El contenedor sigue usando el volumen, no la copia:

```bash
docker compose cp app:/app/vendor .
```

### Ver los cambios

En desarrollo FrankenPHP corre en modo clásico ([ADR 0012](docs/adr/0012-desarrollo-en-modo-clasico.md)): cada petición arranca Laravel de nuevo, así que un cambio en PHP, rutas, configuración, vistas o `.env` se ve en la siguiente petición, sin reiniciar nada. El modo worker de Octane, que deja la aplicación arrancada en memoria, queda para la imagen de producción (`docker-compose.yml` sin el override).

`worker` corre `queue:listen`, que arranca Laravel para cada trabajo: un cambio en un job se ve en el siguiente, sin reiniciar.

Las vistas compiladas y los registros de Inertia DevTools se guardan en memoria (`tmpfs`): se pierden cada vez que el contenedor se detiene o se reinicia, no solo al recrearlo, y se vuelven a generar solos.

### Probar bajo Octane

Como desarrollo no corre bajo Octane, un dato que se quede en memoria entre peticiones (una propiedad `static`, un singleton con estado) no se nota ahí. Para probar con la imagen de producción en el mismo equipo se levanta como otro proyecto de Compose y en otro puerto:

```bash
APP_PORT=8001 docker compose -f docker-compose.yml -p veni-prod up -d --build
docker compose -f docker-compose.yml -p veni-prod down -v    # al terminar; -v borra solo los volúmenes de veni-prod
```

Queda en <http://localhost:8001>, ya migrada, con su propia base de datos y sin tocar el entorno de desarrollo. En PowerShell, `$env:APP_PORT = 8001` antes del primer comando.

La prueba de humo hace ese recorrido sola, y es la que corre la CI en cada PR: levanta la imagen en un proyecto de Compose aparte (`veni-humo`, puerto 8189) con un `.env` temporal, espera `/up`, comprueba la migración y las cachés de Laravel, pide veinte veces la página de inicio alternando inglés y español (`<html lang>`, `Content-Language`, la descripción y las traducciones de la página tienen que seguir a cada petición), comprueba que un archivo de `storage/app` sobrevive a recrear los contenedores y que `worker` y `scheduler` solo se dan por sanos cuando ya corren su comando, y borra todo al terminar:

```bash
docker build --target prod -t veni-humo .
bash tests/docker/smoke-prod.sh veni-humo
docker image rm veni-humo
```

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
bash tests/docker/entrypoint-dev.test.sh   # arranque del contenedor de desarrollo (sin root)
bash tests/docker/entrypoint-prod.test.sh  # arranque del contenedor de producción
bash tests/docker/deploy.test.sh           # script de despliegue, con un docker falso
bash tests/docker/smoke-prod.sh <imagen>   # la imagen de producción bajo Octane (ver «Probar bajo Octane»)
npm run lint                               # ESLint
npm run typecheck                          # vue-tsc
npm test                                   # Vitest (incluye la verificación de los íconos)
npm run build
```

`security.yml` revisa cada semana y en cada PR los avisos de `composer audit`, `npm audit` (desde high) y los secretos del historial con gitleaks.

## Despliegue

Cada push a `main` publica la imagen de producción en `ghcr.io/wokerjj/veni-roldanillo`, y [release-please](https://github.com/googleapis/release-please) mantiene un PR de release con la versión y el `CHANGELOG.md`; al fusionarlo salen el tag, la release y la imagen `X.Y.Z`. El despliegue al servidor está **preparado y desactivado**: se lanza a mano, por versión, y no corre mientras no exista la variable que lo activa. No hay secrets reales en el repositorio ni servicios de pago.

Cómo se numeran las versiones, qué necesita el servidor, qué secrets hacen falta y cómo activarlo: [Entrega y despliegue](docs/despliegue.md).

## Documentación

- [Visión y propuesta](docs/01-vision.md)
- [Producto y funcionalidades](docs/02-producto.md)
- [Arquitectura](docs/03-arquitectura.md)
- [Entrega y despliegue](docs/despliegue.md)
- [Seguridad y marco legal](docs/04-seguridad-y-legal.md)
- [Roadmap y alcance del MVP](docs/05-roadmap.md)
- [Alineación con el Plan de Desarrollo Municipal](docs/06-plan-desarrollo-municipal.md)
- [Análisis de mercado](docs/07-mercado.md)
- [Decisiones de arquitectura (ADR)](docs/adr/)
- [Guía de marca](brand/README.md)

## Créditos

- **Íconos:** [colombia-icons](https://github.com/Mteheran/colombia-icons), licencia MIT, © Miguel Teheran. Los que usa la app están copiados en [`resources/icons/colombia`](resources/icons/colombia) desde una versión fija, con su licencia ([ADR 0011](docs/adr/0011-iconos-colombia-icons.md)).
- **Mapa:** datos © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), publicados como PMTiles por [veni-mapa](https://github.com/WokerJJ/veni-mapa). Se pinta con [MapLibre GL JS](https://maplibre.org/) y [PMTiles](https://github.com/protomaps/PMTiles), los dos con licencia BSD de 3 cláusulas.

## Autor

**Jhon Hucker Chalarca Ramírez (Woker)** · Roldanillo, Valle del Cauca
[GitHub](https://github.com/WokerJJ) · [LinkedIn](https://linkedin.com/in/jhonhucker) · [Portafolio](https://wokerjj.github.io/portafolio)

## Licencia

Código propietario. Todos los derechos reservados. Ver [LICENSE](LICENSE).
