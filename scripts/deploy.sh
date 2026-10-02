#!/usr/bin/env bash
# Lo que corre en el servidor en cada despliegue (docs/despliegue.md).
# deploy.yml lo copia al servidor junto a docker-compose.yml y lo ejecuta por
# SSH, pero no depende de GitHub: también sirve a mano, desde la carpeta del
# servidor que tiene docker-compose.yml y el .env:
#
#   bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z
#
# Baja la imagen, la deja anotada en el .env (APP_IMAGE), levanta los servicios
# (el servicio migrate aplica las migraciones antes de que arranque la app) y
# comprueba que la app responde /up. Si algo falla termina con error, deja el
# .env como estaba y guarda los registros de los contenedores en el servidor
# (deploy-logs/) sin imprimirlos: la salida de este script termina en el
# registro de GitHub Actions, que es público, y el error de una migración puede
# traer datos de una persona.
set -euo pipefail

# Segundos de espera a que la app responda /up.
timeout=${DEPLOY_TIMEOUT:-120}
# 1 mientras el .env apunta a una imagen que todavía no demostró que arranca.
env_replaced=0

# Reemplaza el .env por una copia con otro APP_IMAGE, de un solo paso (mv): si
# el script se corta a la mitad, el .env es el anterior o el nuevo, nunca uno a
# medio escribir. La copia nace con cp -p y se reescribe sin cambiarle dueño,
# grupo ni permisos; si aun así no quedan iguales, no se reemplaza: el usuario
# del contenedor dejaría de poder leerlo.
# El archivo es otro (otro inodo) y un contenedor que ya lo tenía montado sigue
# viendo el anterior; no importa, porque solo cambia APP_IMAGE y con eso `up`
# recrea los cuatro servicios que lo montan.
replace_env() {
    local image=$1
    cp -p .env .env.nuevo
    if grep -q '^APP_IMAGE=' .env; then
        sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.nuevo
    else
        {
            cat .env
            printf '\nAPP_IMAGE=%s\n' "$image"
        } > .env.nuevo
    fi
    if [ "$(stat -c '%u:%g:%a' .env.nuevo)" != "$(stat -c '%u:%g:%a' .env)" ]; then
        echo "No se pudo conservar el dueño, el grupo o los permisos del .env en su copia:" >&2
        echo "la carpeta tiene que heredar el grupo del .env (docs/despliegue.md, «Qué hay en el servidor»)." >&2
        return 1
    fi
    mv -f .env.nuevo .env
}

# Los registros de los servicios, a un archivo que solo lee quien despliega.
save_logs() {
    local file
    file="deploy-logs/$(date +%Y%m%d-%H%M%S).log"
    (
        umask 077
        mkdir -p deploy-logs
        docker compose logs --no-color --tail 200 "$@" > "$file" 2>&1 < /dev/null
    ) || true
    echo "Registro de los contenedores, en el servidor: $(pwd)/$file" >&2
}

# Un fallo después de reescribir el .env: se guardan los registros, se muestra
# el estado de los servicios (sin su salida) y el .env vuelve al anterior en
# on_exit.
abort() {
    echo "$1" >&2
    shift
    save_logs "$@"
    docker compose ps --all < /dev/null >&2 || true
    exit 1
}

on_exit() {
    local status=$?
    if [ "$status" != 0 ] && [ "$env_replaced" = 1 ]; then
        if cp -p .env.anterior .env.nuevo && mv -f .env.nuevo .env; then
            echo "El .env volvió a como estaba antes de este despliegue (copia en .env.anterior)." >&2
            echo "Los contenedores no: cómo volver a la versión anterior está en docs/despliegue.md." >&2
        else
            echo "No se pudo restaurar el .env: la copia anterior está en $(pwd)/.env.anterior." >&2
        fi
    fi
    rm -f .env.nuevo
    exit "$status"
}

main() {
    local image=${1:?Uso: bash deploy.sh <imagen:versión>}
    local file previous deadline

    # El valor termina dentro de una expresión de sed y del .env. Con el
    # digest al final (…:X.Y.Z@sha256:…) se baja exactamente esa imagen,
    # aunque la etiqueta se haya vuelto a publicar.
    if [[ ! "$image" =~ ^[a-z0-9][a-z0-9./:_-]*:[A-Za-z0-9._-]+(@sha256:[0-9a-f]{64})?$ ]]; then
        echo "Imagen inválida: «$image». Se espera <registro>/<nombre>:<versión>, con @sha256:<digest> opcional." >&2
        exit 1
    fi

    for file in docker-compose.yml .env; do
        if [ ! -f "$file" ]; then
            echo "Falta $file en $(pwd): esta carpeta no está preparada (docs/despliegue.md)." >&2
            exit 1
        fi
    done

    trap on_exit EXIT

    previous=$(sed -n 's/^APP_IMAGE=//p' .env | tail -n 1)
    echo "Imagen: $image (antes: ${previous:-sin anotar})"

    # Primero se baja, con la imagen nueva solo en el entorno de este comando
    # (gana sobre el .env): si no existe o el registro no responde, el .env y
    # lo que está corriendo quedan intactos.
    # Solo la imagen de la aplicación. db y meilisearch no se bajan de nuevo:
    # si su etiqueta se volvió a publicar, un despliegue de la app cambiaría
    # también la base de datos y la reiniciaría. Se actualizan aparte y a
    # propósito (docs/despliegue.md); la primera vez las baja `up`, porque
    # faltan.
    if ! APP_IMAGE="$image" docker compose pull --quiet migrate app worker scheduler < /dev/null; then
        echo "No se pudo bajar $image. El .env y los servicios quedan como estaban." >&2
        exit 1
    fi

    # Compose lee APP_IMAGE del .env: queda escrita la versión desplegada y
    # cualquier `docker compose` posterior en el servidor usa esa misma imagen.
    # Antes, una copia del .env tal como estaba: a ella se vuelve si el
    # arranque falla, y dice qué versión corría antes de esta.
    if [ "$previous" != "$image" ]; then
        cp -p .env .env.anterior
        replace_env "$image"
        env_replaced=1
    fi

    # up recrea los contenedores cuya imagen cambió: detiene app, worker y
    # scheduler, corre migrate y, si termina bien, arranca los nuevos. La
    # versión anterior nunca atiende con el esquema nuevo; a cambio, la app no
    # responde mientras dura la migración y el arranque (unos segundos).
    if ! docker compose up --detach --no-build --remove-orphans < /dev/null; then
        abort "El arranque falló: revisá el servicio migrate." migrate app worker scheduler
    fi

    # < /dev/null: `docker compose exec` lee la entrada estándar, y cuando este
    # script llega por ella (bash -s) se llevaría las líneas que faltan.
    deadline=$((SECONDS + timeout))
    until docker compose exec -T app curl --fail --silent --output /dev/null http://127.0.0.1:8000/up < /dev/null; do
        if [ "$SECONDS" -ge "$deadline" ]; then
            abort "La app no respondió /up en $timeout s." app
        fi
        sleep 2
    done

    env_replaced=0
    echo "La app responde /up."
    docker compose ps --all < /dev/null
}

# Todo dentro de main y la llamada en la última línea: bash termina de leer el
# archivo antes de ejecutar nada, así que ni una entrada estándar consumida ni
# un archivo reemplazado a mitad de la corrida lo dejan a medias.
main "$@"
