# Entrega y despliegue

Cómo llega un cambio de `main` a una imagen versionada y, cuando exista el servidor, a producción. La decisión y sus alternativas están en el [ADR 0013](adr/0013-entrega-por-imagen-versionada.md).

> **Estado:** la imagen y las releases están activas. **El despliegue está preparado y desactivado**: hoy no hay servidor, y no existe ninguno de los secrets ni la variable que lo activa. No se usa ningún servicio de pago.

## Recorrido

```text
PR → main ──► docker.yml ──► ghcr.io/wokerjj/veni-roldanillo:main y :sha-<commit>
         └──► release.yml ──► PR de release (versión + CHANGELOG.md)
                                   │ al fusionarlo
                                   ▼
                       tag vX.Y.Z + release ──► imagen :X.Y.Z y :X.Y
                                                     │ a mano, desactivado
                                                     ▼
                                   deploy.yml ──► servidor (pull, up, migración, /up)
```

| Workflow | Cuándo corre | Qué hace | Estado |
| --- | --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | Cada PR y cada push a `main` | Calidad, seguridad y la prueba de humo de la imagen de producción. Su job `ci-ok` es el check obligatorio | Activo |
| [`docker.yml`](../.github/workflows/docker.yml) | Push a `main`, tags `v*`, y PR que tocan la receta de la imagen | Construye la imagen de producción; la publica en GHCR solo desde `main` y desde tags | Activo |
| [`release.yml`](../.github/workflows/release.yml) | Push a `main` | Mantiene el PR de release; al fusionarlo crea el tag y la release y publica la imagen de esa versión | Activo (ver [requisitos](#requisitos-en-github)) |
| [`deploy.yml`](../.github/workflows/deploy.yml) | A mano | Lleva una versión publicada al servidor | **Desactivado** |

## Imagen

`ghcr.io/wokerjj/veni-roldanillo` es la etapa `prod` del `Dockerfile`: FrankenPHP con Octane, las dependencias de Composer sin las de desarrollo y los assets ya compilados. Una sola imagen para `migrate`, `app`, `worker` y `scheduler`.

| Etiqueta | Qué es |
| --- | --- |
| `X.Y.Z` | Una release. No cambia: es la que se despliega |
| `X.Y` | La última release de esa serie |
| `main` | El último commit de `main` |
| `sha-<commit>` | Un commit concreto de `main` (7 caracteres) |

No hay `latest`: el servidor siempre fija una versión. La imagen se publica solo para `linux/amd64`: el servidor tiene que ser x86-64 (un VPS ARM pediría sumar `linux/arm64` en `docker.yml`).

`docker.yml` publica una versión solo si se cumplen dos cosas, y si no, se detiene sin publicar:

- **El commit del tag está en `main`.** Crear un tag `v*` no pasa por la protección de `main`; así, un tag puesto sobre otra rama o sobre un commit sin PR no llega a GHCR.
- **`X.Y.Z` todavía no existe en GHCR.** Una versión publicada no se reemplaza aunque alguien mueva o vuelva a empujar su tag; lo que haya que corregir sale con una versión nueva.

`sha-<commit>` la publica solo el push a `main`. La imagen de una release es otra construcción del mismo commit: no es idéntica byte a byte a `sha-<commit>`, y por eso la release no vuelve a publicar esa etiqueta (apuntaría a una u otra según qué corrida terminara de última).

Una etiqueta es un nombre; lo que identifica a una imagen es su digest (`sha256:…`, en el resumen de cada corrida de `docker.yml`). **Siempre que se pueda, se despliega por digest:** `deploy.yml` lo resuelve solo y le pide al servidor `X.Y.Z@sha256:…`; a mano, `bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z@sha256:…`.

Las imágenes de base del `Dockerfile` (FrankenPHP, Node y Composer) también van fijadas por digest, y Dependabot propone el nuevo cuando la etiqueta se vuelve a publicar.

Lo que la imagen **no** trae, y lo comprueba la prueba de humo en cada PR: el `.env` (se monta al arrancar), Composer (solo lo copian las etapas que instalan dependencias), la entrada de desarrollo y un proceso con root (corre con el usuario `app`).

Al arrancar, la entrada de la imagen lee el `.env` montado, ejecuta `php artisan optimize` (configuración, eventos, rutas y vistas en caché) y `php artisan storage:link`, y después el comando del servicio. Por eso un cambio en el `.env` del servidor necesita recrear los contenedores, no solo reiniciarlos:

```bash
docker compose up -d --force-recreate app worker scheduler
```

Para entrar sin pasar por esa preparación (un `.env` con el que la app no arranca): `docker compose run --rm --no-deps -e VENI_SKIP_OPTIMIZE=1 app sh`. Con `--no-deps` es solo una consola: sin él, `run` levanta antes los servicios de los que depende `app`, y eso incluye correr `migrate`.

Dos cosas no viven dentro del contenedor, que cada despliegue recrea:

- **Los registros de Laravel** salen por stderr (la imagen fija `LOG_CHANNEL=stderr`, y gana sobre el `.env`): se leen con `docker compose logs app worker scheduler`. No hay `storage/logs/laravel.log`.
- **Lo que guarda la aplicación** en `storage/app` (las fotos que suben los dueños) está en el volumen `app_storage`, que comparten `app` y `worker`. La prueba de humo comprueba que un archivo sobrevive a recrear los contenedores. Entra en las copias de seguridad junto con la base.

### El mapa dentro de la imagen

Vite escribe las URL del mapa en el JavaScript al compilar, así que son parte de la imagen. `docker.yml` las toma de dos **variables** del repositorio (*Settings → Secrets and variables → Actions → Variables*); son públicas, no secretos:

| Variable | Valor |
| --- | --- |
| `VITE_MAP_STYLE_URL` | `https://tiles.veniroldanillo.co/vX.Y.Z/veni-{theme}-{locale}.json` |
| `VITE_MAP_ROUTES_URL` | `https://tiles.veniroldanillo.co/vX.Y.Z/roldanillo-rutas.json` |

Hoy no están definidas: la imagen lleva la demo pública de veni-mapa, que sigue su rama `main` y no es una versión fija ([ADR 0007](adr/0007-mapa-desde-veni-mapa.md)), y `docker.yml` lo deja como aviso en cada corrida. Cuando exista el hosting versionado del mapa se definen las dos; desde ese momento `docker.yml` se detiene si alguna no apunta a una release fija (`…/vX.Y.Z/…`).

Los mismos valores quedan además en el entorno de la imagen ([ADR 0014](adr/0014-seguridad-http-detras-del-proxy.md)): de ahí los lee Laravel para adelantar la conexión con el host del mapa (`<link rel="preconnect">`) y para que la política de seguridad de contenido deje pedirlo. El `.env` del servidor no los cambia, así la app nombra siempre el mismo mapa que trae el JavaScript; para cambiar de mapa hay que construir otra imagen.

### Probarla en local

```bash
docker build --target prod -t veni-humo .
bash tests/docker/smoke-prod.sh veni-humo
```

La prueba levanta `docker-compose.yml` sin el override en un proyecto aparte, con un `.env` temporal, y lo borra al terminar. Es la misma que corre `ci.yml`. Además de que arranca y migra, comprueba la seguridad HTTP de la imagen bajo Octane: las cabeceras, HSTS y las URL con `https://` solo detrás de un proxy de confianza, el host solo de `APP_URL` (sin `X-Forwarded-Host`), las cookies con `Secure`, la CSP activa con un nonce que no se repite en ninguna de las páginas que pide, el `preconnect` al mapa, la caché de assets y fuentes, las páginas de error en los dos idiomas y `storage` en un sandbox.

## Releases

[release-please](https://github.com/googleapis/release-please) lee los commits de `main` (uno por PR, por el squash merge) y mantiene abierto un PR `chore(release): publicar X.Y.Z` con la versión siguiente y el `CHANGELOG.md`. Al fusionar ese PR crea el tag `vX.Y.Z` y la release de GitHub, y `release.yml` publica la imagen `X.Y.Z`. **Nadie crea tags ni releases a mano.**

El tipo de release es `simple`: la versión vive en el tag, en `.release-please-manifest.json` y en la etiqueta de la imagen. La app no es un paquete de Composer ni de npm (`composer.json` y `package.json` no tienen `version`), así que los tipos `php` y `node`, que escriben la versión en esos archivos, no aportan nada.

### Numeración

Antes de 1.0:

- `feat` sube la **menor**: 0.1.0 → 0.2.0.
- `fix`, `perf` y `revert` suben el **parche**: 0.1.0 → 0.1.1.
- Un cambio incompatible (`feat!` o el pie `BREAKING CHANGE:`) sube la menor, no la mayor.
- `docs`, `ci`, `chore`, `refactor`, `test`, `build` y `style` no aparecen en el CHANGELOG ni abren una release por sí solos: no cambian lo que corre en el servidor.
- Dependabot usa los dos prefijos (`.github/dependabot.yml`): `fix(deps)` para las dependencias de producción de Composer y npm y para las imágenes de base del `Dockerfile`, que sí cambian lo que corre y abren una release de parche; `chore(deps)` para los PR que solo traen dependencias de desarrollo y para las actions, que no abren ninguna.

La primera release es la 0.1.0.

### Forzar una versión

Solo hace falta para saltar a una versión que los commits no producen, como la 1.0.0. release-please busca el pie `Release-As` en el **mensaje del commit de `main`**, no en la descripción del PR. Aquí los PR se fusionan con squash y con un cuerpo escrito al fusionar (`gh pr merge --squash --body`), que reemplaza a la descripción del PR: lo que se escriba en la descripción no llega al commit. El pie va en ese cuerpo, como último bloque y tras una línea en blanco:

```bash
gh pr merge <número> --squash \
  --subject "feat: primera versión estable (#<número>)" \
  --body "Resumen del cambio.

Release-As: 1.0.0"
```

Si el PR ya se fusionó sin el pie, el commit de `main` no se puede reescribir (historial lineal, sin force push). release-please acepta entonces un mensaje sustituto en la **descripción del PR ya fusionado**: se edita y se agrega al final este bloque; lo toma en la siguiente corrida de `release.yml` (el próximo push a `main`).

```text
BEGIN_COMMIT_OVERRIDE
feat: primera versión estable

Release-As: 1.0.0
END_COMMIT_OVERRIDE
```

En los dos casos, el PR de release que release-please actualiza tiene que quedar con el título `chore(release): publicar 1.0.0`: si muestra otra versión, el pie no se leyó.

### Requisitos en GitHub

- *Settings → Actions → General → Workflow permissions →* **Allow GitHub Actions to create and approve pull requests**. **Ya está activado**; sin eso `release.yml` falla al abrir el PR de release.
- El PR de release lo abre `GITHUB_TOKEN`, y un PR abierto así no corre la CI sola: sin `ci-ok` la protección de `main` no deja fusionarlo. Dos salidas:
  - **Sin configurar nada:** cerrar el PR de release y volver a abrirlo (*Close pull request* → *Reopen pull request*). Reabrirlo es un evento de una persona, no de `GITHUB_TOKEN`, y la CI corre. Hay que repetirlo si release-please actualiza el PR después, cuando entra otro cambio a `main`. Si GitHub ofrece en el PR el botón **Approve and run**, sirve igual.
  - **Con una GitHub App:** la misma receta que en veni-mapa. Una App sin webhook, con permisos de repositorio *Contents*, *Pull requests* e *Issues* en lectura y escritura, instalada solo en este repositorio; su *Client ID* en la variable `RELEASE_APP_CLIENT_ID` y su clave privada en el secret `RELEASE_APP_PRIVATE_KEY`. Con la App, el PR, el tag y la release quedan a su nombre, la CI corre sola y el tag dispara `docker.yml` directamente.
- La primera vez que `docker.yml` publique, el paquete de GHCR nace privado. Para que el servidor lo baje sin credenciales: en el paquete, *Package settings → Change visibility → Public*.

## Despliegue (preparado y desactivado)

### Qué hay en el servidor

Una carpeta (`/srv/veni-roldanillo`) con esto:

- `docker-compose.yml` y `deploy.sh`: los copia `deploy.yml` en cada despliegue, los del tag que se despliega.
- `.env`: se escribe una vez a mano. Nunca sale del servidor ni entra en la imagen. Lo leen dos usuarios: `deploy`, que corre Compose y anota en él la versión, y el del contenedor (`app`, uid y gid 1000), que lo recibe montado. Por eso va con dueño `deploy`, grupo `1000` y permisos `640` (`chown deploy:1000 .env && chmod 640 .env`, como root). Si el contenedor no puede leerlo, no arranca y lo dice en `docker compose logs`.
- `.env.anterior`: la copia que deja cada despliegue del `.env` tal como estaba antes de cambiar de versión. Tiene los mismos secretos y los mismos permisos.
- `deploy-logs/`: los registros de los contenedores de cada despliegue que falló, un archivo por intento, que solo lee `deploy` (carpeta `700`, archivos `600`). No se borran solos.

La carpeta va con dueño `deploy`, grupo `1000` y el bit setgid (`chown deploy:1000 /srv/veni-roldanillo && chmod 2750 /srv/veni-roldanillo`, como root). El despliegue no edita el `.env`: escribe una copia y la pone en su lugar de un solo paso, para que un corte a la mitad nunca deje un `.env` a medio escribir. Con setgid la copia nace con el grupo de la carpeta, el `1000` que necesita el contenedor; sin él nacería con el grupo de `deploy`, y `deploy.sh` se detiene antes de reemplazar nada y lo dice.

Los datos están en tres volúmenes de Docker: `db_data` (PostgreSQL), `meilisearch_data` y `app_storage` (lo que guarda la aplicación en `storage/app`).

El `.env` parte de `.env.example` con estos cambios:

| Variable | En producción |
| --- | --- |
| `APP_ENV`, `APP_DEBUG` | `production` y `false` (la imagen ya los fija; van igual para que el archivo diga la verdad) |
| `APP_KEY` | `docker run --rm --entrypoint php ghcr.io/wokerjj/veni-roldanillo:X.Y.Z artisan key:generate --show` |
| `APP_URL` | `https://veniroldanillo.co`. Es además el único host que la app atiende: con otro `Host` responde 400 ([abajo](#delante-de-la-app-tls-y-proxies-de-confianza)) |
| `DB_PASSWORD`, `MEILISEARCH_KEY` | Una cada una, de `openssl rand -base64 32` |
| `MEILI_ENV` | `production` |
| `LOG_LEVEL` | `warning` |
| `LOG_CHANNEL` | `stderr` (la imagen ya lo fija; va igual para que el archivo diga la verdad) |
| `APP_IMAGE` | `ghcr.io/wokerjj/veni-roldanillo:X.Y.Z`. La reescribe cada despliegue: es la versión que está corriendo |
| `TRUSTED_PROXIES` | La IP o el rango desde el que llega el proxy que termina TLS ([abajo](#delante-de-la-app-tls-y-proxies-de-confianza)). Nunca `*` |
| `SESSION_SECURE_COOKIE` | `true` (la imagen ya lo fija y el `.env` no lo cambia; va igual para que el archivo diga la verdad) |
| `CSP_REPORT_ONLY` | `false`. Con `true` la política de contenido solo informa en la consola del navegador, sin bloquear: para probar un cambio de la política, nunca como estado normal (la app lo avisa en `docker compose logs app` al arrancar). Se lee como booleano: `off`, `no` y `0` son no |
| `CSP_REPORT_CANDIDATE` | `false`. Con `true` la política vigente sigue bloqueando y se manda además la candidata (el perfil `candidate`, en código) solo para informar |
| `CSP_FRAME_ANCESTORS` | Vacía: ningún sitio puede mostrar la app en un iframe. Es solo para entornos locales |

Las variables `VITE_*` no hacen falta en el servidor: ya quedaron dentro de la imagen, en el JavaScript y en su entorno. Si el `.env` las trae, valen las de la imagen.

### Delante de la app: TLS y proxies de confianza

La app no termina TLS ([ADR 0014](adr/0014-seguridad-http-detras-del-proxy.md)): sirve HTTP en el puerto 8000, publicado solo en `127.0.0.1` del servidor, y delante va un proxy que atiende HTTPS y le pasa la petición. El proxy le pasa el host tal cual en `Host`, y la IP del cliente y que la petición llegó por HTTPS en `X-Forwarded-For` y `X-Forwarded-Proto`; la app solo se cree esas dos a las IP de `TRUSTED_PROXIES`. Sin eso genera URL `http://`, no manda HSTS y cuenta los límites de peticiones con la IP del proxy, la misma para todos.

`X-Forwarded-Host` y `X-Forwarded-Port` no se aceptan de nadie, ni del proxy de confianza: Caddy y `cloudflared` ya mandan el host real en `Host`, y si alguno dejara pasar los que escribe el cliente, este elegiría el host de los enlaces que genera la app. Por lo mismo la app solo atiende el host de `APP_URL`, sin subdominios, y los del propio equipo (`127.0.0.1` y `localhost`, por donde piden `/up` la revisión de salud de la imagen y `deploy.sh`); con cualquier otro `Host` responde 400.

Desde dónde ve llegar la app al proxy depende de dónde corre el proxy:

| Delante de la app | `TRUSTED_PROXIES` |
| --- | --- |
| Caddy instalado en el servidor (`reverse_proxy 127.0.0.1:8000`) o un túnel de Cloudflare (`cloudflared` hacia `http://127.0.0.1:8000`) | La puerta de enlace de la red de Compose: con el proxy de puertos de Docker (el que viene por defecto), las conexiones al puerto publicado llegan al contenedor desde esa IP. Se lee con `docker network inspect veni-roldanillo_default --format '{{(index .IPAM.Config 0).Gateway}}'` (por ejemplo `172.18.0.1`). Si la red se recrea (`docker compose down`), Docker puede darle otra subred: el rango de sus redes, `172.16.0.0/12`, evita reconfigurar a cambio de confiar en todos los contenedores del servidor, que son todos de esta app |
| Cloudflare con proxy (nube naranja) y Caddy en el servidor | Lo mismo, y Caddy tiene que pasarle a la app la IP del visitante, no la del borde de Cloudflare ni una que escriba el visitante ([abajo](#con-cloudflare-delante-de-caddy)) |
| Un proxy dentro del propio contenedor (la prueba de humo) | `127.0.0.1` |

Caddy, con un `Caddyfile` mínimo, obtiene y renueva el certificado solo y manda esas cabeceras sin configurar nada más:

```caddyfile
veniroldanillo.co {
    reverse_proxy 127.0.0.1:8000
}
```

Para comprobar desde fuera que la app ve las peticiones como HTTPS de un proxy de confianza: la respuesta trae HSTS solo en ese caso.

```bash
curl -sI https://veniroldanillo.co | grep -i strict-transport-security
# strict-transport-security: max-age=31536000; includeSubDomains
```

Sin esa línea, `TRUSTED_PROXIES` no coincide con la IP desde la que llega el proxy.

#### Con Cloudflare delante de Caddy

Con la nube naranja, a Caddy le llegan las conexiones desde el borde de Cloudflare, que agrega la IP del visitante **al final** de `X-Forwarded-For`; lo que venga antes lo escribió el visitante. Caddy tiene que confiar solo en los rangos de Cloudflare, sacar de ahí la IP del visitante leyendo la cabecera de derecha a izquierda y pasarle a la app solo esa:

```caddyfile
{
    servers {
        # Rangos de Cloudflare (https://www.cloudflare.com/ips/), revisados el 2026-10-03.
        trusted_proxies static 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
        # De derecha a izquierda: la primera IP que no es de Cloudflare es la del visitante.
        trusted_proxies_strict
    }
}

veniroldanillo.co {
    # Registro de accesos, con la IP que Caddy le atribuye a cada petición (client_ip).
    log
    reverse_proxy 127.0.0.1:8000 {
        # A la app le llega solo esa IP, no la cadena entera.
        header_up X-Forwarded-For {client_ip}
    }
}
```

Las dos piezas hacen falta. Sin `trusted_proxies`, Caddy toma por visitante al borde de Cloudflare y todos comparten su límite de peticiones. Sin `trusted_proxies_strict`, Caddy toma **la primera** IP de `X-Forwarded-For`, la que escribe el visitante: cualquiera podría elegir su IP y saltarse los límites.

Se eligió `trusted_proxies_strict` sobre `client_ip_headers CF-Connecting-IP`, que también funciona (Cloudflare reescribe esa cabecera en cada petición): lee `X-Forwarded-For` igual que la app (de derecha a izquierda, saltando los proxies de confianza), así que la receta no cambia si un día se quita Cloudflare o se agrega otro proxy, y no depende de una cabecera de un solo proveedor. Los rangos de Cloudflare cambian poco, pero cambian: se revisan al actualizar el servidor. El módulo [caddy-cloudflare-ip](https://github.com/WeidiDeng/caddy-cloudflare-ip) los mantiene solo (`trusted_proxies cloudflare`), a cambio de compilar Caddy con `xcaddy`.

Para comprobarlo, una petición con una IP inventada en `X-Forwarded-For` tiene que quedar registrada con la IP real:

```bash
# Desde tu equipo: la IP con que te ve Cloudflare, y una petición con otra inventada.
curl -s https://veniroldanillo.co/cdn-cgi/trace | grep '^ip='
curl -s -o /dev/null -H 'X-Forwarded-For: 203.0.113.99' https://veniroldanillo.co/

# En el servidor: la IP que Caddy le atribuyó, la misma que le pasó a la app.
journalctl -u caddy -n 50 -o cat | grep -o '"client_ip":"[^"]*"' | tail -n 1
```

Tiene que salir la IP de `cdn-cgi/trace`. Si sale `203.0.113.99`, falta `trusted_proxies_strict`; si sale una IP de Cloudflare, falta su rango en `trusted_proxies`.

Lo que sirve Caddy desde `public/` sin pasar por Laravel lleva su propia caché (`config/octane.php`): los assets de `/build/assets`, que llevan el hash del contenido en el nombre, un año como `immutable`; las fuentes de `/fonts`, sin hash, una semana y después se revalidan. Un CDN delante (Cloudflare) respeta esas cabeceras.

### Qué hace un despliegue

`deploy.yml` se lanza a mano con dos datos: la versión (`X.Y.Z`) y la palabra `desplegar`.

1. Comprueba la confirmación, el formato de la versión y que esa imagen existe en GHCR, y anota su digest: al servidor le pide `X.Y.Z@sha256:…`, esa imagen exacta.
2. Abre SSH al servidor con una llave exclusiva del despliegue; al servidor lo reconoce por su llave pública guardada, no acepta la que le presenten.
3. Copia a la carpeta del servidor el `docker-compose.yml` y el [`scripts/deploy.sh`](../scripts/deploy.sh) de ese tag (`scp`).
4. Ejecuta en el servidor `bash deploy.sh <imagen>`, que:
   - baja la imagen de la aplicación (`docker compose pull`) sin haber tocado nada: si no se puede bajar, el `.env` y lo que está corriendo quedan como estaban;
   - copia el `.env` a `.env.anterior` y lo reemplaza, de un solo paso, por uno con el `APP_IMAGE` nuevo;
   - `docker compose up -d`: detiene `app`, `worker` y `scheduler`, corre **`migrate`** (`php artisan migrate --force`) y, solo si termina bien, arranca los nuevos;
   - espera a que la app responda `/up`.
5. Pide `https://veniroldanillo.co/up` desde fuera.

Mientras dura la migración y el arranque la app no responde: unos 8 segundos en la prueba local, sin migraciones pendientes. A cambio, la versión anterior nunca atiende con el esquema nuevo.

Si la migración falla, ningún servicio arranca; si la app no llega a responder `/up`, el despliegue también falla. En los dos casos `deploy.sh`:

- deja el `.env` como estaba antes (desde `.env.anterior`), para que `APP_IMAGE` siga diciendo la última versión que funcionó;
- guarda los registros de los contenedores en `deploy-logs/<fecha>-<hora>.log`, en el servidor, y **no los imprime**: el repositorio es público, el registro de Actions también, y el error de una migración puede traer datos de una persona (el valor que chocó con una restricción, por ejemplo). En Actions solo quedan la ruta de ese archivo y el estado de los servicios (`docker compose ps`). Se leen entrando al servidor.

El `.env` vuelve solo; los contenedores y la base de datos, no.

### Volver a la versión anterior

Una imagen solo sabe deshacer las migraciones que trae. Por eso el orden es **primero deshacer las migraciones con la imagen nueva, después desplegar la anterior**; al revés, la imagen anterior no tiene esos archivos y `migrate:rollback` no encuentra qué deshacer.

1. **Cuántas migraciones aplicó la versión nueva**: las del último lote, en `docker compose logs migrate` o en `deploy-logs/`. Con la imagen nueva (si el `.env` ya volvió a la anterior, se nombra en el comando):

   ```bash
   APP_IMAGE=ghcr.io/wokerjj/veni-roldanillo:<nueva> docker compose run --rm --no-deps app php artisan migrate:status
   ```

2. **Detener lo que escribe** y deshacer esas N migraciones, con la imagen nueva:

   ```bash
   docker compose stop app worker scheduler
   APP_IMAGE=ghcr.io/wokerjj/veni-roldanillo:<nueva> docker compose run --rm --no-deps app php artisan migrate:rollback --step=N --force
   ```

   `--step=N` y no un `migrate:rollback` a secas: sin `--step` se deshace el último lote entero, y si la versión nueva no llegó a aplicar ninguna migración, ese lote es de una versión anterior.

3. **Desplegar la anterior**: `deploy.yml` con esa versión, o `bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:<anterior>` en el servidor. Su servicio `migrate` no encuentra nada pendiente.

Si la versión nueva no traía migraciones, basta el paso 3.

Dos reglas para que esto funcione el día que haga falta:

- **Las migraciones de una versión tienen que ser compatibles con la versión anterior**: agregar (una tabla, una columna con valor por defecto o que admita nulos) y no quitar ni renombrar en la misma release lo que la anterior todavía usa. Lo que se quita, se quita una release después. Así, si el paso 2 no se puede dar, la versión anterior arranca igual sobre el esquema nuevo.
- **Antes de desplegar una versión con migraciones, un `pg_dump`**: `migrate:rollback` devuelve el esquema, no los datos que un `down` borra (una columna eliminada vuelve vacía).

  ```bash
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "veni-$(date +%Y%m%d-%H%M%S).dump"
  ```

  Hoy es un paso a mano: `deploy.sh` no lo hace. Si una versión trae migraciones se ve en su release, comparando `database/migrations` con la versión anterior.

Un despliegue no toca `db` ni `meilisearch`: solo baja la imagen de la aplicación. Sus etiquetas (`postgis/postgis:18-3.6`, `getmeili/meilisearch:v1.54`) se pueden volver a publicar con parches, y bajarlas en cada despliegue cambiaría y reiniciaría la base de datos sin que nadie lo pidiera. Se actualizan aparte, con una copia de seguridad reciente: `docker compose pull db meilisearch && docker compose up -d`.

`deploy.sh` no depende de GitHub: queda en la carpeta del servidor desde el primer despliegue, y `bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z` hace lo mismo a mano (mejor con el digest: `…:X.Y.Z@sha256:…`). Sus pruebas, con un `docker` falso, están en `tests/docker/deploy.test.sh` y corren en cada PR.

### Secrets y variables

**Hoy no existe ninguno.** Los secrets son del entorno `production` (*Settings → Environments*): solo el job de despliegue puede leerlos. El entorno ya está creado, sin secrets: solo acepta corridas lanzadas desde ramas protegidas y cada una espera la aprobación de un revisor. Las variables son del repositorio (*Settings → Secrets and variables → Actions → Variables*). Ningún valor va en el código.

| Nombre | Tipo | Qué es | Cómo se obtiene |
| --- | --- | --- | --- |
| `DEPLOY_ENABLED` | Variable | El interruptor. Solo con el valor `true` corre el job | Se crea al final, con todo lo demás listo |
| `DEPLOY_HOST` | Secret | Dirección del servidor (IP o nombre) | La da el proveedor del VPS |
| `DEPLOY_USER` | Secret | Usuario SSH del despliegue, sin root | En el servidor: `adduser --disabled-password deploy && usermod -aG docker deploy` |
| `DEPLOY_SSH_KEY` | Secret | Llave privada ed25519, solo para este despliegue | `ssh-keygen -t ed25519 -N '' -C 'despliegue veni-roldanillo' -f veni-deploy`; la pública (`veni-deploy.pub`) va en `~deploy/.ssh/authorized_keys` del servidor; la privada se carga con `gh secret set DEPLOY_SSH_KEY --env production < veni-deploy` y se borra del equipo |
| `DEPLOY_KNOWN_HOSTS` | Secret | La llave pública del servidor, en formato `known_hosts` | `ssh-keyscan -p <puerto> -t ed25519 <servidor>` (con el puerto de `DEPLOY_SSH_PORT`: si no es el 22, la línea tiene que salir como `[servidor]:puerto` o SSH no la reconoce), comparando la huella con la que da el propio servidor: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` |
| `DEPLOY_PATH` | Variable (opcional) | Carpeta del servidor | Por defecto `/srv/veni-roldanillo` |
| `DEPLOY_SSH_PORT` | Variable (opcional) | Puerto SSH | Por defecto `22` |
| `DEPLOY_URL` | Variable (opcional) | Dirección pública que se verifica al final | Por defecto `https://veniroldanillo.co` |

Y los de los otros workflows:

| Nombre | Tipo | Workflow | Qué es |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Automático | `docker.yml`, `release.yml`, `deploy.yml` | Lo entrega GitHub en cada corrida; publica en GHCR y abre el PR de release. No se configura |
| `VITE_MAP_STYLE_URL`, `VITE_MAP_ROUTES_URL` | Variables (opcionales) | `docker.yml` | El mapa de la imagen ([arriba](#el-mapa-dentro-de-la-imagen)) |
| `RELEASE_APP_CLIENT_ID` | Variable (opcional) | `release.yml` | *Client ID* de la GitHub App de releases |
| `RELEASE_APP_PRIVATE_KEY` | Secret (opcional) | `release.yml` | Clave privada de esa App |

El usuario `deploy` está en el grupo `docker`, que en la práctica equivale a root en ese servidor: por eso la llave es exclusiva, sin otro uso, y se cambia si se sospecha de ella.

### Activarlo

1. Servidor x86-64 con Docker Engine y el plugin de Compose, el usuario `deploy` y la carpeta con su `.env`, con los dueños y permisos de [arriba](#qué-hay-en-el-servidor).
2. Paquete de GHCR público, o `docker login ghcr.io` en el servidor con un token de solo lectura de paquetes.
3. Los cuatro secrets en el entorno `production`. El entorno ya existe, limitado a ramas protegidas y con revisor obligatorio (*Required reviewers*): el workflow se lanza desde `main` y espera esa aprobación.
4. Variable `DEPLOY_ENABLED` = `true`.
5. *Actions → Despliegue → Run workflow* con una versión publicada.

### Lo que falta antes de un servidor real

- **El proxy que termina TLS:** decidido que va delante de la app y cómo confía en él ([ADR 0014](adr/0014-seguridad-http-detras-del-proxy.md), [arriba](#delante-de-la-app-tls-y-proxies-de-confianza)); falta elegir entre Caddy en el servidor y un túnel de Cloudflare, instalarlo y escribir `TRUSTED_PROXIES` en el `.env`.
- **Mapa en una versión fija:** cuando exista `tiles.veniroldanillo.co` ([arriba](#el-mapa-dentro-de-la-imagen)).
- **Copias de seguridad y monitoreo:** descritos en [Arquitectura](03-arquitectura.md#servidor), sin implementar. Tienen que incluir el volumen `app_storage` además de la base, y el `pg_dump` previo a una versión con migraciones hoy es [a mano](#volver-a-la-versión-anterior).
- **PASO RECOMENDADO PENDIENTE · proteger los tags `v*`:** hoy cualquiera con permiso de escritura puede crear, mover o borrar un tag `v*`. `docker.yml` ya limita el daño (solo publica commits de `main` y no reescribe una versión publicada) y el despliegue fija el digest, pero el tag en sí no está protegido. Falta un *ruleset* de tags (*Settings → Rules → Rulesets → New tag ruleset*) con el patrón `v*` que restrinja crear, actualizar y borrar. Como el tag de cada release lo crea `release.yml` con `GITHUB_TOKEN`, el ruleset necesita dejar pasar a quien lo crea (GitHub Actions hoy, o la GitHub App de releases): decidir eso es parte del paso.
