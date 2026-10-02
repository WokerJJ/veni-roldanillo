# ADR 0013 · Entrega por imagen versionada: migración antes de arrancar, releases automáticas y despliegue a mano

- Estado: aceptada
- Fecha: 2026-10-02
- Precisa: ADR 0001 (cómo llega la aplicación al servidor; el stack no cambia).
- Afecta a: `docs/03-arquitectura.md` («Servicios» y «CI/CD») y `docs/despliegue.md`.

## Contexto

El ADR 0001 decidió desplegar en un VPS con GitHub Actions, y `docs/03-arquitectura.md` lo resumía en una línea: entrar por SSH y ejecutar `docker compose pull && docker compose up -d && php artisan migrate --force`. Al prepararlo (#7) esa línea dejaba varias cosas sin decidir:

- **Cuándo se migra.** Migrar después de `up` deja a la versión nueva atendiendo peticiones contra el esquema anterior hasta que la migración termina, y si la migración falla, la versión nueva ya quedó arriba.
- **Qué se despliega.** `main` cambia con cada PR: sin una versión con nombre no hay forma de decir qué corre en el servidor ni a qué volver.
- **Dónde se resuelve la configuración.** `php artisan optimize` acelera el arranque de cada worker de Octane, pero guarda en un archivo los valores del `.env`.
- **Cómo se sabe que la imagen funciona.** Desarrollo corre en modo clásico y Pest sin Octane (ADR 0012): nada ejecutaba la imagen de producción antes de publicarla.

Todavía no hay servidor, y el proyecto no usa servicios de pago ni guarda claves reales.

## Alternativas

- **Migrar con un comando después de `up`** (lo que estaba escrito). Simple, pero con los dos problemas de arriba.
- **Migrar en la entrada del contenedor de `app`.** Deja de depender de quien despliega, pero `worker` y `scheduler` usan la misma imagen y arrancan a la vez: habría que impedir que migren los tres.
- **Un servicio `migrate` de una sola ejecución del que dependen los demás** (la elegida).
- **`php artisan optimize` al construir la imagen.** La caché de configuración dejaría los valores del `.env` dentro de la imagen: secretos publicados en GHCR y una imagen distinta por servidor.
- **Releases a mano** (tag y notas escritas por una persona). Se olvidan o se numeran sin criterio; los commits convencionales ya traen la información.
- **release-please con tipo `php` o `node`.** Escriben la versión en `composer.json` o `package.json`, que aquí no tienen `version`: la app no se publica como paquete.
- **Desplegar solo al crear cada release.** Cómodo, pero poner una versión en producción con una migración dentro es una decisión que hoy toma una persona, y sin servidor no hay cómo probarlo.
- **Señal de vida del worker** (un archivo que `queue:work` toca en cada vuelta) como revisión de salud. Detecta un proceso colgado, pero en modo de mantenimiento el worker no da vueltas y aparecería como enfermo; añade código a la aplicación, y Compose no reinicia un contenedor por estar «unhealthy».

## Decisión

- **Una imagen, cuatro servicios.** `migrate`, `app`, `worker` y `scheduler` usan la etapa `prod`. `migrate` corre `php artisan migrate --force` una vez en cada `docker compose up`; los otros tres esperan a que termine bien (`service_completed_successfully`). También en desarrollo, con la imagen `dev`.
- **La configuración se resuelve al arrancar.** La entrada de la imagen (`docker/entrypoint-prod.sh`) ejecuta `php artisan optimize` y `storage:link` con el `.env` montado, y después el comando. La imagen no contiene el `.env` ni cachés.
- **Revisiones de salud.** `app`: `/up`. `db`: por TCP. `worker` y `scheduler`: que su proceso principal sea `queue:work` o `schedule:work`.
- **La imagen se publica en GHCR** (`docker.yml`): `main` y `sha-<commit>` desde `main`; `X.Y.Z` y `X.Y` desde cada release. Sin `latest`.
- **Las releases las abre release-please** (`release.yml`), tipo `simple`. Antes de 1.0, `feat` sube la menor y `fix` el parche; `docs`, `ci` y `chore` no abren release.
- **La prueba de humo** (`tests/docker/smoke-prod.sh`) levanta la imagen con `docker-compose.yml` y PostGIS en cada PR, dentro de `ci-ok`.
- **El despliegue es manual y por versión** (`deploy.yml`): se elige una versión ya publicada y se confirma por escrito. Queda desactivado hasta que exista la variable `DEPLOY_ENABLED`.

## Consecuencias

- La versión nueva nunca atiende sin su esquema, y la anterior nunca atiende con el nuevo: Compose detiene `app`, `worker` y `scheduler`, migra y arranca los nuevos. A cambio, **cada despliegue corta el servicio unos segundos** (unos 8 en la prueba local, sin migraciones pendientes). Un despliegue sin corte pediría dos copias de `app` y migraciones compatibles con la versión anterior; no se justifica todavía.
- Si la migración falla, nada arranca: el sitio queda caído hasta desplegar otra versión o corregir la base. Las migraciones se prueban antes en la prueba de humo, pero sobre una base vacía.
- Un cambio en el `.env` del servidor pide recrear los contenedores (`up -d --force-recreate`): la configuración quedó en caché al arrancar.
- `docker compose up` también migra en desarrollo: una migración rota deja el entorno sin arrancar, con el error en `docker compose logs migrate`.
- Un worker colgado sin terminar no se detecta. `queue:work` termina solo ante un trabajo que pasa de su tiempo límite, la pérdida de la conexión con la base, el exceso de memoria o `--max-time`, y `restart` lo relanza; si aparece un caso que no cubra, se revisa la señal de vida.
- La prueba de humo suma la construcción de la imagen a cada PR (con caché de capas) y es la primera que corre bajo Octane.
- El PR de release lo abre `GITHUB_TOKEN`, que no dispara la CI: hay que lanzarla a mano en ese PR o configurar una GitHub App (`docs/despliegue.md`).
- El servidor solo necesita `docker-compose.yml` y su `.env`. Quién termina TLS y la seguridad HTTP quedan para #41.
