#!/usr/bin/env bash
# Lo que corre en el servidor en cada despliegue (docs/despliegue.md). Lo envía
# deploy.yml por SSH, pero no depende de GitHub: también sirve a mano, desde la
# carpeta del servidor que tiene docker-compose.yml y el .env:
#
#   bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z
#
# Deja anotada la imagen en el .env (APP_IMAGE), la baja, levanta los servicios
# (el servicio migrate aplica las migraciones antes de que arranque la app) y
# comprueba que la app responde /up. Si algo falla termina con error y dice qué.
set -euo pipefail

image=${1:?Uso: bash deploy.sh <imagen:versión>}
# Segundos de espera a que la app responda /up.
timeout=${DEPLOY_TIMEOUT:-120}

# El valor termina dentro de una expresión de sed y del .env.
if [[ ! "$image" =~ ^[a-z0-9][a-z0-9./:_-]*:[A-Za-z0-9._-]+$ ]]; then
    echo "Imagen inválida: «$image». Se espera <registro>/<nombre>:<versión>." >&2
    exit 1
fi

for file in docker-compose.yml .env; do
    if [ ! -f "$file" ]; then
        echo "Falta $file en $(pwd): esta carpeta no está preparada (docs/despliegue.md)." >&2
        exit 1
    fi
done

# Compose lee APP_IMAGE del .env: queda escrita la versión desplegada y
# cualquier `docker compose` posterior en el servidor usa esa misma imagen.
# Se reescribe el contenido sin reemplazar el archivo (sed -i crea uno nuevo):
# los contenedores lo tienen montado y seguirían viendo el anterior.
if grep -q '^APP_IMAGE=' .env; then
    updated=$(sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env)
    printf '%s\n' "$updated" > .env
else
    printf '\nAPP_IMAGE=%s\n' "$image" >> .env
fi

echo "Imagen: $image"

# Solo la imagen de la aplicación. db y meilisearch no se bajan de nuevo: si
# su etiqueta se volvió a publicar, un despliegue de la app cambiaría también
# la base de datos y la reiniciaría. Se actualizan aparte y a propósito
# (docs/despliegue.md); la primera vez las baja `up`, porque faltan.
docker compose pull --quiet migrate app worker scheduler

# up recrea los contenedores cuya imagen cambió: detiene app, worker y
# scheduler, corre migrate y, si termina bien, arranca los nuevos. La versión
# anterior nunca atiende con el esquema nuevo; a cambio, la app no responde
# mientras dura la migración y el arranque (unos segundos).
if ! docker compose up --detach --no-build --remove-orphans; then
    echo "El arranque falló. Registro de la migración:" >&2
    docker compose logs --no-color --tail 40 migrate >&2 || true
    exit 1
fi

deadline=$((SECONDS + timeout))
until docker compose exec -T app curl --fail --silent --output /dev/null http://127.0.0.1:8000/up; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        echo "La app no respondió /up en $timeout s. Registro:" >&2
        docker compose logs --no-color --tail 40 app >&2 || true
        exit 1
    fi
    sleep 2
done

echo "La app responde /up."
docker compose ps --all
