# ADR 0012 · Desarrollo en modo clásico de FrankenPHP; Octane solo en producción

- Estado: aceptada
- Fecha: 2026-10-02
- Sustituye en parte: ADR 0001 (en desarrollo la app ya no corre bajo Octane).
- Afecta a: `README.md` («Desarrollo local») y `docs/03-arquitectura.md`.

## Contexto

El ADR 0001 puso Laravel sobre FrankenPHP con Octane y el mismo Compose en local y en producción. En Windows, con el repositorio en una carpeta del sistema montada en el contenedor por Docker Desktop, ese entorno no servía para trabajar (#32):

- **Lento.** La página de inicio tardaba 4,98 s: cada arranque de Laravel leía `vendor/` (más de 10 000 archivos) a través del montaje.
- **CPU.** Al levantar el entorno la CPU llegaba al 200 %: FrankenPHP arranca 24 workers y cada uno arrancaba Laravel sobre ese `vendor/` montado. En reposo, `app` se quedaba entre el 2 % y el 13 %, con picos.
- **Código viejo.** Los workers de Octane guardan la aplicación ya arrancada. Tras editar una ruta, solo 12 de 20 peticiones respondían con el código nuevo; las demás caían en workers que seguían con el anterior.

Para el tercer problema se midió lo mismo (20 peticiones justo después de editar una ruta) con cada configuración:

| Configuración | Peticiones con el código nuevo |
| --- | --- |
| Octane, como estaba | 12 de 20 |
| Octane con `--watch` | 0 de 20 |
| Octane con `--workers=1 --max-requests=1` | 19 de 20 |
| Modo clásico, OPcache por defecto (revalida cada 2 s) | 17 de 20 |
| **Modo clásico, `opcache.revalidate_freq=0`** | 20 de 20 |

## Alternativas

- **Octane con `--watch`.** El montaje de Docker Desktop no entrega al contenedor los eventos de archivos de Windows: el vigilante nunca se entera de un cambio y los workers no se recargan.
- **Octane con `--workers=1 --max-requests=1`.** Un solo worker que se recicla tras cada petición todavía atiende una con el código anterior, y de Octane ya no queda nada de lo que aporta.
- **Un vigilante con sondeo** (revisar las fechas de los archivos cada cierto tiempo y recargar los workers). No depende de los eventos, pero recorre el árbol a través del mismo montaje lento, gasta CPU también en reposo y deja siempre una ventana, entre guardar y la siguiente pasada, en la que responde el código anterior. Es además una pieza más que mantener en la imagen de desarrollo.
- **El repositorio dentro de WSL2.** En el sistema de archivos de Linux los eventos llegan y la lectura es rápida, pero obliga a mover el repositorio, el editor y las herramientas a WSL. El entorno tiene que funcionar con el proyecto clonado en una carpeta de Windows, que es como se trabaja en él, y con la misma receta en macOS y Linux.
- **Modo clásico en desarrollo y Octane en producción** (la elegida).

## Decisión

- **Desarrollo** (`docker-compose.override.yml`, etapa `dev` del Dockerfile): `app` corre FrankenPHP en modo clásico, `frankenphp php-server --root public/ --listen :8000`. Cada petición arranca Laravel con el código del momento: no hay workers que recargar ni vigilante.
- En esa etapa, `opcache.revalidate_freq=0`: OPcache revisa cada archivo en cada petición en lugar de esperar 2 s.
- `worker` usa `queue:listen` en desarrollo por la misma razón: arranca Laravel para cada trabajo.
- **Producción** no cambia: etapa `prod`, `php artisan octane:frankenphp` y `queue:work`, con `docker-compose.yml` sin el override. Ahí el ADR 0001 sigue vigente.

Para que arrancar Laravel en cada petición sea barato, `vendor/` vive en un volumen con nombre que instala la entrada del contenedor (`docker/entrypoint-dev.sh`), y las vistas compiladas y los registros de Inertia DevTools se escriben en `tmpfs`: nada de eso pasa ya por el montaje.

## Consecuencias

- Con el conjunto, la página de inicio responde en alrededor de 1 s (entre 0,6 y 1,1 s en las últimas mediciones, de 10 peticiones seguidas cada una), `app` queda en 0 % de CPU en reposo y 20 de 20 peticiones ven un cambio recién guardado.
- **Desarrollo y producción ya no ejecutan la aplicación igual.** Bajo Octane la aplicación arranca una vez y atiende muchas peticiones; en modo clásico arranca en cada una. Un dato de una petición que se quede en memoria pasa inadvertido en desarrollo y aparece en producción, en la petición de otra persona. De ahí la regla: nada de estado por petición en propiedades `static` ni en singletons, y el servicio que necesite guardar estado se lista en `flush` de `config/octane.php` para que Octane lo descarte después de cada petición.
- Para probar bajo Octane en el mismo equipo se levanta la imagen de producción como otro proyecto de Compose y en otro puerto: `docker compose -f docker-compose.yml -p veni-prod up -d --build` con otro `APP_PORT` (los pasos están en el README).
- CI corre Pest sin Octane y no arranca la imagen de producción. La prueba de humo de esa imagen queda pendiente para #7.
- Cada petición de desarrollo paga el arranque completo de Laravel. Es el costo aceptado a cambio de ver siempre el código actual.
- `queue:listen` arranca Laravel cada pocos segundos aunque no haya trabajos: en reposo `worker` muestra saltos de CPU (del 3 % al 19 % en la medición) que `queue:work` no tendría.
- Si el montaje de Docker Desktop llega a entregar los eventos de archivos, `--watch` vuelve a ser una opción y se revisa esta decisión.
