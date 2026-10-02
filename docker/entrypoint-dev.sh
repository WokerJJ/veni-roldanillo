#!/bin/sh
# Entrada del contenedor en desarrollo. vendor/ vive en un volumen con nombre
# (docker-compose.override.yml), no en la carpeta del proyecto: aquí se instalan
# las dependencias de Composer cuando el volumen está vacío o cuando
# composer.lock cambió desde la última instalación.
set -e

# Hash del composer.lock con el que se instaló por última vez (dentro del volumen).
stamp=vendor/.composer-lock.sha256

dependencies_up_to_date() {
    [ -f vendor/autoload.php ] && [ -f "$stamp" ] \
        && [ "$(cat "$stamp")" = "$(sha256sum < composer.lock)" ]
}

if ! dependencies_up_to_date; then
    # Un volumen creado con una imagen anterior a esta queda con dueño root.
    if [ ! -w vendor ]; then
        echo "vendor/ no se puede escribir. Recreá el volumen: docker compose down," \
            "docker volume rm veni-roldanillo_vendor y docker compose build." >&2
        exit 1
    fi

    # app, worker y scheduler comparten el volumen y arrancan a la vez: flock
    # deja instalar a uno solo; los demás esperan y vuelven a comprobar.
    (
        flock 9
        if ! dependencies_up_to_date; then
            composer install --no-interaction --no-progress --prefer-dist
            sha256sum < composer.lock > "$stamp"
        fi
    ) 9> vendor/.composer-install.lock
fi

exec "$@"
