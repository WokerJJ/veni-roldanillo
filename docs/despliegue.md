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
| `sha-<commit>` | Un commit concreto (7 caracteres) |

No hay `latest`: el servidor siempre fija una versión.

Lo que la imagen **no** trae, y lo comprueba la prueba de humo en cada PR: el `.env` (se monta al arrancar), Composer, la entrada de desarrollo y un proceso con root (corre con el usuario `app`).

Al arrancar, la entrada de la imagen lee el `.env` montado, ejecuta `php artisan optimize` (configuración, eventos, rutas y vistas en caché) y `php artisan storage:link`, y después el comando del servicio. Por eso un cambio en el `.env` del servidor necesita recrear los contenedores, no solo reiniciarlos:

```bash
docker compose up -d --force-recreate app worker scheduler
```

Para entrar sin pasar por esa preparación (un `.env` con el que la app no arranca): `docker compose run --rm -e VENI_SKIP_OPTIMIZE=1 app sh`.

### El mapa dentro de la imagen

Vite escribe las URL del mapa en el JavaScript al compilar, así que son parte de la imagen. `docker.yml` las toma de dos **variables** del repositorio (*Settings → Secrets and variables → Actions → Variables*); son públicas, no secretos:

| Variable | Valor |
| --- | --- |
| `VITE_MAP_STYLE_URL` | `https://tiles.veniroldanillo.co/vX.Y.Z/veni-{theme}-{locale}.json` |
| `VITE_MAP_ROUTES_URL` | `https://tiles.veniroldanillo.co/vX.Y.Z/roldanillo-rutas.json` |

Hoy no están definidas: la imagen lleva la demo pública de veni-mapa, que sigue su rama `main` y no es una versión fija ([ADR 0007](adr/0007-mapa-desde-veni-mapa.md)), y `docker.yml` lo deja como aviso en cada corrida. Cuando exista el hosting versionado del mapa se definen las dos; desde ese momento `docker.yml` se detiene si alguna no apunta a una release fija (`…/vX.Y.Z/…`).

### Probarla en local

```bash
docker build --target prod -t veni-humo .
bash tests/docker/smoke-prod.sh veni-humo
```

La prueba levanta `docker-compose.yml` sin el override en un proyecto aparte, con un `.env` temporal, y lo borra al terminar. Es la misma que corre `ci.yml`.

## Releases

[release-please](https://github.com/googleapis/release-please) lee los commits de `main` (uno por PR, por el squash merge) y mantiene abierto un PR `chore(release): publicar X.Y.Z` con la versión siguiente y el `CHANGELOG.md`. Al fusionar ese PR crea el tag `vX.Y.Z` y la release de GitHub, y `release.yml` publica la imagen `X.Y.Z`. **Nadie crea tags ni releases a mano.**

El tipo de release es `simple`: la versión vive en el tag, en `.release-please-manifest.json` y en la etiqueta de la imagen. La app no es un paquete de Composer ni de npm (`composer.json` y `package.json` no tienen `version`), así que los tipos `php` y `node`, que escriben la versión en esos archivos, no aportan nada.

### Numeración

Antes de 1.0:

- `feat` sube la **menor**: 0.1.0 → 0.2.0.
- `fix`, `perf` y `revert` suben el **parche**: 0.1.0 → 0.1.1.
- Un cambio incompatible (`feat!` o el pie `BREAKING CHANGE:`) sube la menor, no la mayor.
- `docs`, `ci`, `chore`, `refactor`, `test`, `build` y `style` no aparecen en el CHANGELOG ni abren una release por sí solos: no cambian lo que corre en el servidor. Las actualizaciones de Dependabot (`chore(deps)`) salen con la siguiente release.

La primera release es la 0.1.0.

### Forzar una versión

Solo hace falta para saltar a una versión que los commits no producen, como la 1.0.0. Se escribe `Release-As` como **última línea del cuerpo del PR**, después del checklist de la plantilla y separada por una línea en blanco:

```text
Release-As: 1.0.0
```

Con squash merge el cuerpo del PR es el del commit, y release-please solo lee esa línea si está en el bloque final del cuerpo: en cualquier otro lugar la ignora sin avisar. Si quedó mal ubicada, se edita el cuerpo del PR ya fusionado y se agrega al final:

```text
BEGIN_COMMIT_OVERRIDE
<título del commit, igual que en main>

Release-As: 1.0.0
END_COMMIT_OVERRIDE
```

### Requisitos en GitHub

- *Settings → Actions → General → Workflow permissions →* **Allow GitHub Actions to create and approve pull requests**. Hoy está desmarcado: sin eso `release.yml` falla al abrir el PR de release.
- El PR de release lo abre `GITHUB_TOKEN`, y un PR abierto así no corre la CI sola: sin `ci-ok` la protección de `main` no deja fusionarlo. Dos salidas:
  - **Sin configurar nada:** en el PR, *Checks* → **Approve and run**.
  - **Con una GitHub App:** la misma receta que en veni-mapa. Una App sin webhook, con permisos de repositorio *Contents*, *Pull requests* e *Issues* en lectura y escritura, instalada solo en este repositorio; su *Client ID* en la variable `RELEASE_APP_CLIENT_ID` y su clave privada en el secret `RELEASE_APP_PRIVATE_KEY`. Con la App, el PR, el tag y la release quedan a su nombre, la CI corre sola y el tag dispara `docker.yml` directamente.
- La primera vez que `docker.yml` publique, el paquete de GHCR nace privado. Para que el servidor lo baje sin credenciales: en el paquete, *Package settings → Change visibility → Public*.

## Despliegue (preparado y desactivado)

### Qué hay en el servidor

Una carpeta (`/srv/veni-roldanillo`) con dos archivos:

- `docker-compose.yml`: lo copia `deploy.yml` en cada despliegue, el del tag que se despliega.
- `.env`: se escribe una vez a mano. Nunca sale del servidor ni entra en la imagen. Lo leen dos usuarios: `deploy`, que corre Compose y anota en él la versión, y el del contenedor (`app`, uid y gid 1000), que lo recibe montado. Por eso va con dueño `deploy`, grupo `1000` y permisos `640` (`chown deploy:1000 .env && chmod 640 .env`, como root). Si el contenedor no puede leerlo, no arranca y lo dice en `docker compose logs`.

El `.env` parte de `.env.example` con estos cambios:

| Variable | En producción |
| --- | --- |
| `APP_ENV`, `APP_DEBUG` | `production` y `false` (la imagen ya los fija; van igual para que el archivo diga la verdad) |
| `APP_KEY` | `docker run --rm --entrypoint php ghcr.io/wokerjj/veni-roldanillo:X.Y.Z artisan key:generate --show` |
| `APP_URL` | `https://veniroldanillo.co` |
| `DB_PASSWORD`, `MEILISEARCH_KEY` | Una cada una, de `openssl rand -base64 32` |
| `MEILI_ENV` | `production` |
| `LOG_LEVEL` | `warning` |
| `APP_IMAGE` | `ghcr.io/wokerjj/veni-roldanillo:X.Y.Z`. La reescribe cada despliegue: es la versión que está corriendo |

Las variables `VITE_*` no hacen falta en el servidor: ya quedaron dentro de la imagen.

### Qué hace un despliegue

`deploy.yml` se lanza a mano con dos datos: la versión (`X.Y.Z`) y la palabra `desplegar`.

1. Comprueba la confirmación, el formato de la versión y que esa imagen existe en GHCR.
2. Abre SSH al servidor con una llave exclusiva del despliegue; al servidor lo reconoce por su llave pública guardada, no acepta la que le presenten.
3. Copia el `docker-compose.yml` de ese tag.
4. Ejecuta [`scripts/deploy.sh`](../scripts/deploy.sh) en el servidor:
   - anota la imagen en el `.env` (`APP_IMAGE`);
   - `docker compose pull`;
   - `docker compose up -d`: detiene `app`, `worker` y `scheduler`, corre **`migrate`** (`php artisan migrate --force`) y, solo si termina bien, arranca los nuevos;
   - espera a que la app responda `/up`.
5. Pide `https://veniroldanillo.co/up` desde fuera.

Mientras dura la migración y el arranque la app no responde: unos 8 segundos en la prueba local, sin migraciones pendientes. A cambio, la versión anterior nunca atiende con el esquema nuevo.

Si la migración falla, ningún servicio arranca y el job termina con el registro de `migrate`. Para volver a la versión anterior se lanza el despliegue con esa versión; las migraciones no se revierten solas (`php artisan migrate:rollback` a mano, si corresponde).

`scripts/deploy.sh` no depende de GitHub: en el servidor, `bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z` hace lo mismo.

### Secrets y variables

**Hoy no existe ninguno.** Los secrets son del entorno `production` (*Settings → Environments*): solo el job de despliegue puede leerlos. Las variables son del repositorio (*Settings → Secrets and variables → Actions → Variables*). Ningún valor va en el código.

| Nombre | Tipo | Qué es | Cómo se obtiene |
| --- | --- | --- | --- |
| `DEPLOY_ENABLED` | Variable | El interruptor. Solo con el valor `true` corre el job | Se crea al final, con todo lo demás listo |
| `DEPLOY_HOST` | Secret | Dirección del servidor (IP o nombre) | La da el proveedor del VPS |
| `DEPLOY_USER` | Secret | Usuario SSH del despliegue, sin root | En el servidor: `adduser --disabled-password deploy && usermod -aG docker deploy` |
| `DEPLOY_SSH_KEY` | Secret | Llave privada ed25519, solo para este despliegue | `ssh-keygen -t ed25519 -N '' -C 'despliegue veni-roldanillo' -f veni-deploy`; la pública (`veni-deploy.pub`) va en `~deploy/.ssh/authorized_keys` del servidor; la privada se carga con `gh secret set DEPLOY_SSH_KEY --env production < veni-deploy` y se borra del equipo |
| `DEPLOY_KNOWN_HOSTS` | Secret | La llave pública del servidor, en formato `known_hosts` | `ssh-keyscan -t ed25519 <servidor>`, comparando la huella con la que da el propio servidor: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` |
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

1. Servidor con Docker Engine y el plugin de Compose, el usuario `deploy` y la carpeta con su `.env`.
2. Paquete de GHCR público, o `docker login ghcr.io` en el servidor con un token de solo lectura de paquetes.
3. Entorno `production` con los cuatro secrets; conviene pedir en él la aprobación de una persona (*Required reviewers*) y limitarlo a la rama `main`, que es desde donde se lanza el workflow.
4. Variable `DEPLOY_ENABLED` = `true`.
5. *Actions → Despliegue → Run workflow* con una versión publicada.

### Lo que falta antes de un servidor real

- **Quién termina TLS y la seguridad HTTP ([#41](https://github.com/WokerJJ/veni-roldanillo/issues/41)):** `app` publica el puerto 8000 solo en `127.0.0.1`. Falta decidir qué va delante (Caddy en el servidor o un túnel de Cloudflare) y configurar proxies de confianza, cookies seguras, cabeceras, CSP y el límite de peticiones.
- **Mapa en una versión fija:** cuando exista `tiles.veniroldanillo.co` ([arriba](#el-mapa-dentro-de-la-imagen)).
- **Copias de seguridad y monitoreo:** descritos en [Arquitectura](03-arquitectura.md#servidor), sin implementar.
