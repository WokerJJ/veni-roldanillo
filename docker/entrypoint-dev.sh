#!/bin/sh
# Entrada del contenedor en desarrollo: instala las dependencias de Composer
# si el volumen del código aún no las tiene y luego ejecuta el comando.
set -e

if [ ! -f vendor/autoload.php ]; then
    composer install --no-interaction --no-progress --prefer-dist
fi

exec "$@"
