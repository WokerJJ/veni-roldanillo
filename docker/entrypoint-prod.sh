#!/bin/sh
# Entrada del contenedor en producción (app, worker, scheduler y migrate). La
# imagen no trae el .env ni cachés de Laravel: el .env se monta al arrancar
# (docker-compose.yml) y aquí se prepara la aplicación con esa configuración
# antes de ejecutar el comando del servicio.
set -e

# Salida de emergencia: ejecuta el comando tal cual, sin preparar nada (una
# consola para revisar un .env con el que la aplicación no arranca).
if [ "${VENI_SKIP_OPTIMIZE:-}" = 1 ]; then
    exec "$@"
fi

# Configuración, eventos, rutas y vistas en caché: los workers de Octane y
# queue:work arrancan leyendo un archivo ya resuelto en lugar de procesar el
# .env y los archivos de rutas. No puede hacerse al construir la imagen: la
# caché de configuración dejaría escritos los valores del .env, que son
# secretos y cambian de un servidor a otro. Si falla (un .env mal formado, una
# ruta que no se puede guardar en caché), el contenedor no arranca y el error
# queda en `docker compose logs`.
php artisan optimize

# public/storage → storage/app/public, para servir los archivos públicos que
# suba la aplicación. --force lo rehace si ya existe: el contenedor se
# reinicia con el mismo sistema de archivos y sin él cada reinicio dejaría un
# error en el registro.
php artisan storage:link --force

# exec: el comando reemplaza a este script como PID 1 y recibe el SIGTERM de
# `docker compose stop`.
exec "$@"
