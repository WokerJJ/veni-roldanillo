#!/usr/bin/env bash
# Prueba de humo de la imagen de producción. Desarrollo corre en modo clásico
# y las pruebas de Pest no pasan por Octane (ADR 0012): esta es la que levanta
# la imagen tal como va al servidor, con docker-compose.yml sin el override, y
# comprueba que arranca, que migra y que una petición no deja estado para la
# siguiente (ADR 0010: el idioma se resuelve en cada petición).
#
#   docker build --target prod -t veni-tmp-prod .
#   bash tests/docker/smoke-prod.sh veni-tmp-prod
#
# Levanta un proyecto de Compose aparte, con su propia base de datos, y lo
# borra al terminar (contenedores y volúmenes). Variables opcionales:
#   SMOKE_PROJECT   nombre del proyecto de Compose (veni-humo)
#   SMOKE_PORT      puerto en 127.0.0.1 (8189)
#   SMOKE_REQUESTS  peticiones alternando idioma (20)
#   SMOKE_TIMEOUT   segundos de espera a /up y a los servicios (180)
set -euo pipefail

image=${1:?Uso: bash tests/docker/smoke-prod.sh <imagen>}
project=${SMOKE_PROJECT:-veni-humo}
port=${SMOKE_PORT:-8189}
requests=${SMOKE_REQUESTS:-20}
timeout=${SMOKE_TIMEOUT:-180}
base="http://127.0.0.1:$port"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# En Git Bash, las rutas del contenedor (/app/…) no se convierten a rutas de
# Windows. Solo para docker: curl sí necesita la conversión de /dev/null.
docker() {
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' command docker "$@"
}

if ! docker image inspect "$image" > /dev/null 2>&1; then
    echo "No existe la imagen $image: construila con docker build --target prod -t $image ." >&2
    exit 2
fi

# Al terminar se borra el proyecto entero, con sus volúmenes: nunca sobre uno
# que ya existía.
if [ -n "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$project")" ]; then
    echo "El proyecto de Compose «$project» ya tiene contenedores: elegí otro con SMOKE_PROJECT." >&2
    exit 2
fi

tmp=$(mktemp -d)
env_file="$tmp/env"
# Docker en Windows necesita la ruta de Windows (C:/…), no la de Git Bash.
if command -v cygpath > /dev/null 2>&1; then
    env_file=$(cygpath -m "$env_file")
fi

compose() {
    APP_IMAGE="$image" APP_ENV_FILE="$env_file" APP_PORT="$port" \
        docker compose -f docker-compose.yml -p "$project" --env-file "$env_file" "$@"
}

cleanup() {
    local status=$?
    if [ "$status" != 0 ] || [ "$failures" != 0 ]; then
        echo
        echo "--- Registros ---"
        compose logs --no-color --tail 40 migrate app worker scheduler || true
        compose exec -T app tail -n 30 storage/logs/laravel.log 2> /dev/null || true
    fi
    compose down --volumes --remove-orphans > /dev/null 2>&1 || true
    rm -rf "$tmp"
    exit "$status"
}

total=0
failures=0
trap cleanup EXIT

# El .env de ejemplo con una clave de aplicación recién generada: de paso
# comprueba que .env.example sirve para arrancar la imagen.
sed -e "s|^APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|" \
    -e "s|^APP_URL=.*|APP_URL=$base|" .env.example > "$tmp/env"

# --- Comprobaciones ------------------------------------------------------------

check() {
    local name=$1
    shift
    total=$((total + 1))
    if "$@"; then
        echo "ok     $name"
    else
        failures=$((failures + 1))
        echo "FALLA  $name"
    fi
}

# Sin Compose y sin la entrada: lo que trae la imagen por sí sola.
in_image() {
    docker run --rm --entrypoint sh "$image" -c "$1"
}

in_app() {
    compose exec -T app sh -c "$1"
}

wait_for_up() {
    local deadline=$((SECONDS + timeout))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if [ "$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "$base/up" || true)" = 200 ]; then
            return 0
        fi
        sleep 1
    done
    return 1
}

wait_healthy() {
    local id status deadline=$((SECONDS + timeout))
    id=$(compose ps --quiet "$1")
    while [ "$SECONDS" -lt "$deadline" ]; do
        status=$(docker inspect --format '{{.State.Health.Status}}' "$id" 2> /dev/null || true)
        if [ "$status" = healthy ]; then
            return 0
        fi
        sleep 1
    done
    echo "    $1 quedó en «${status:-sin estado}»"
    return 1
}

migrate_service_succeeded() {
    local id exit_code
    id=$(compose ps --all --quiet migrate)
    exit_code=$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$id")
    [ "$exit_code" = "exited 0" ] || {
        echo "    migrate quedó en «$exit_code»"
        return 1
    }
}

nothing_left_to_migrate() {
    local output
    output=$(compose exec -T app php artisan migrate --force 2>&1) || {
        echo "    $output"
        return 1
    }
    grep -q 'Nothing to migrate' <<< "$output" || {
        echo "    quedaban migraciones sin aplicar: $output"
        return 1
    }
}

# Una petición a $1 que debe llegar en el idioma $2: estado 200, cabecera
# Content-Language y <html lang>. Todas mandan Accept-Language: es, así que en
# las de inglés tiene que ganar ?lang.
responds_in() {
    local path=$1 locale=$2 response status headers
    response=$(curl --silent --show-error --include --max-time 10 \
        --header 'Accept-Language: es' "$base$path" | tr -d '\r') || {
        echo "    $path: la petición falló"
        return 1
    }
    status=$(sed -n '1s/^HTTP[^ ]* \([0-9]*\).*/\1/p' <<< "$response")
    [ "$status" = 200 ] || {
        echo "    $path respondió ${status:-sin estado}"
        return 1
    }
    headers=$(sed '/^$/q' <<< "$response")
    grep -qi "^content-language: $locale\$" <<< "$headers" || {
        echo "    $path: Content-Language no es $locale"
        return 1
    }
    grep -q "<html lang=\"$locale\"" <<< "$response" || {
        echo "    $path: <html lang> no es $locale"
        return 1
    }
}

# Peticiones seguidas alternando idioma. Bajo Octane cada worker atiende
# muchas: si el idioma de una se quedara en memoria, la siguiente del otro
# idioma llegaría mal.
alternating_requests() {
    local i wrong=0
    for i in $(seq 1 "$requests"); do
        if [ $((i % 2)) = 1 ]; then
            responds_in '/?lang=en' en || wrong=$((wrong + 1))
        else
            responds_in '/' es || wrong=$((wrong + 1))
        fi
    done
    [ "$wrong" = 0 ] || {
        echo "    $wrong de $requests peticiones llegaron en otro idioma o fallaron"
        return 1
    }
}

# --- Ejecución -----------------------------------------------------------------

echo "Imagen $image, proyecto $project, $base"

# shellcheck disable=SC2016 # $(id -u) lo resuelve el shell del contenedor.
check "la imagen no corre como root" in_image 'test "$(id -u)" != 0'
check "la imagen no trae la entrada de desarrollo" in_image 'test ! -e /app/docker/entrypoint-dev.sh'
check "la imagen no trae un .env" in_image 'test ! -e /app/.env'
check "la imagen no trae Composer" in_image '! command -v composer > /dev/null'

# up espera a db sana y a que migrate termine bien antes de arrancar los demás.
compose up --detach --no-build --quiet-pull
if ! wait_for_up; then
    echo "FALLA  /up no respondió 200 en $timeout s"
    exit 1
fi
echo "ok     /up responde 200 (a los $SECONDS s)"
total=$((total + 1))

check "el servicio migrate terminó bien" migrate_service_succeeded
check "no quedó nada por migrar" nothing_left_to_migrate
check "app corre Octane sobre FrankenPHP" in_app 'grep -qa octane:frankenphp /proc/1/cmdline'
check "configuración y rutas en caché" in_app 'test -f bootstrap/cache/config.php && test -f bootstrap/cache/routes-v7.php'
check "public/storage enlazado" in_app 'test -L public/storage'
check "entorno production aunque el .env diga local" in_app 'php artisan env | grep -q production'
check "$requests peticiones alternando en y es" alternating_requests
check "worker sano" wait_healthy worker
check "scheduler sano" wait_healthy scheduler

echo
echo "$((total - failures)) de $total comprobaciones pasaron en $SECONDS s"
[ "$failures" = 0 ]
