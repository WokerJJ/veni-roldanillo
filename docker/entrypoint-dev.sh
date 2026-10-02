#!/bin/sh
# Entrada del contenedor en desarrollo. vendor/ vive en un volumen con nombre
# (docker-compose.override.yml), no en la carpeta del proyecto: aquí se instalan
# las dependencias de Composer cuando el volumen está vacío o cuando lo
# instalado ya no corresponde a composer.lock.
set -e

# Salida de emergencia: ejecuta el comando tal cual, sin revisar ni instalar
# (para reparar el volumen o trabajar sin red con lo que haya en vendor/).
if [ "${VENI_SKIP_INSTALL:-}" = 1 ]; then
    exec "$@"
fi

# Sello de la última instalación completa (dentro del volumen): el hash del
# composer.lock con el que se instaló y el de vendor/composer/installed.json,
# donde Composer anota lo que de verdad quedó instalado. Con solo el hash del
# lock, un `composer install` hecho en otra rama pasaba por actual al volver.
stamp=vendor/.composer-install.sha256
installed=vendor/composer/installed.json

dependencies_up_to_date() {
    [ -f vendor/autoload.php ] && [ -f "$installed" ] && [ -f "$stamp" ] \
        && [ "$(cat "$stamp")" = "$(sha256sum < composer.lock && sha256sum < "$installed")" ]
}

# Cómo encontrar el volumen sin suponer su nombre: el prefijo es el proyecto de
# Compose, que cambia con la carpeta o con -p.
volume_help() {
    cat >&2 <<'EOF'
O empezá de cero borrando el volumen (el siguiente arranque reinstala todo):
  docker compose down
  docker volume rm $(docker volume ls -q -f label=com.docker.compose.volume=vendor -f label=com.docker.compose.project=<proyecto>)
<proyecto> es el nombre del proyecto de Compose (lo muestra `docker compose ls`; por defecto, el de la carpeta).
EOF
}

if ! dependencies_up_to_date; then
    # Composer como root dejaría en el volumen archivos que el usuario del
    # contenedor después no puede actualizar ni borrar.
    if [ "$(id -u)" = 0 ]; then
        cat >&2 <<'EOF'
entrypoint-dev: las dependencias de Composer faltan o no corresponden a composer.lock, y no se instalan como root: vendor/ quedaría con archivos que el usuario del contenedor no puede tocar.
Repetí el comando sin --user root. Si necesitás root para otra cosa, ejecutalo sin instalar:
  docker compose run --rm --user root -e VENI_SKIP_INSTALL=1 app <comando>
EOF
        exit 1
    fi

    # Un volumen creado con una imagen anterior, o en el que Composer corrió
    # como root, tiene archivos que este usuario no puede reemplazar: la
    # instalación fallaría a medias.
    foreign=$(find vendor -maxdepth 2 ! -user "$(id -u)" -print -quit 2> /dev/null) || true
    if [ ! -w vendor ] || [ -n "$foreign" ]; then
        cat >&2 <<EOF
entrypoint-dev: vendor/ tiene archivos de otro usuario (por ejemplo ${foreign:-vendor}) y Composer no puede reemplazarlos. Pasa cuando Composer corrió como root o el volumen viene de una imagen anterior.
Devolvelos al usuario del contenedor:
  docker compose run --rm --user root -e VENI_SKIP_INSTALL=1 app chown -R $(id -u):$(id -g) vendor
EOF
        volume_help
        exit 1
    fi

    # app, worker y scheduler comparten el volumen y arrancan a la vez: flock
    # deja instalar a uno solo; los demás esperan y vuelven a comprobar.
    (
        flock 9
        if ! dependencies_up_to_date; then
            # El hash del lock se toma antes de instalar: si composer.lock
            # cambia durante la instalación (un cambio de rama), el sello no
            # coincide y el siguiente arranque reinstala. Y sin sello mientras
            # se instala, una instalación fallida o interrumpida nunca pasa por
            # completa.
            lock_hash=$(sha256sum < composer.lock)
            rm -f "$stamp"

            composer install --no-interaction --no-progress --prefer-dist || {
                status=$?
                cat >&2 <<'EOF'
entrypoint-dev: composer install falló (el error está arriba) y el contenedor no arranca con las dependencias a medias. El siguiente arranque lo intenta de nuevo.
Mientras tanto, para entrar sin instalar:
  docker compose run --rm -e VENI_SKIP_INSTALL=1 app <comando>   # ejecuta el comando con lo que haya en vendor/
  docker compose run --rm --entrypoint sh app                    # una consola sin pasar por esta entrada
EOF
                volume_help
                exit "$status"
            }

            { echo "$lock_hash" && sha256sum < "$installed"; } > "$stamp"
        fi
    ) 9> vendor/.composer-install.lock
fi

exec "$@"
