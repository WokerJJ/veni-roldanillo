#!/usr/bin/env bash
# Prueba de humo de la imagen de producción. Desarrollo corre en modo clásico
# y las pruebas de Pest no pasan por Octane (ADR 0012): esta es la que levanta
# la imagen tal como va al servidor, con docker-compose.yml sin el override, y
# comprueba que arranca, que migra, que una petición no deja estado para la
# siguiente (ADR 0010: el idioma se resuelve en cada petición), que lo que
# guarda la aplicación sobrevive a un despliegue y que worker y scheduler solo
# se dan por sanos cuando de verdad están corriendo.
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
# Segundos que worker y scheduler tienen que seguir arriba después de sanos.
stable_wait=15
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
        # Los registros de Laravel salen por stderr (LOG_CHANNEL en la imagen):
        # están aquí mismo, no en un archivo dentro del contenedor.
        compose logs --no-color --tail 40 migrate app worker scheduler || true
    fi
    compose down --volumes --remove-orphans > /dev/null 2>&1 || true
    rm -rf "$tmp"
    exit "$status"
}

total=0
failures=0
trap cleanup EXIT

# El .env de ejemplo con una clave de aplicación recién generada: de paso
# comprueba que .env.example sirve para arrancar la imagen. Además:
# - TRUSTED_PROXIES=127.0.0.1: las peticiones que se hacen desde dentro del
#   contenedor de app hacen de proxy de confianza (ADR 0014); las que llegan
#   desde este equipo, por el puerto publicado, no lo son.
# - Un mapa y unas cookies que la imagen no deja cambiar: el preconnect y la
#   CSP tienen que nombrar el mapa con que se compiló el JavaScript, y las
#   cookies salir con Secure aunque el .env diga otra cosa.
sed -e "s|^APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|" \
    -e "s|^APP_URL=.*|APP_URL=$base|" \
    -e "s|^TRUSTED_PROXIES=.*|TRUSTED_PROXIES=127.0.0.1|" \
    -e "s|^VITE_MAP_STYLE_URL=.*|VITE_MAP_STYLE_URL=https://otro-mapa.example.test/veni-{theme}-{locale}.json|" \
    .env.example > "$tmp/env"
echo 'SESSION_SECURE_COOKIE=false' >> "$tmp/env"
# Lo lee el usuario del contenedor, que no es quien corre esta prueba.
chmod 644 "$tmp/env"

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

# La descripción de la página en el idioma $1, tal como está en lang/$1.json.
description_in() {
    sed -n 's/^ *"meta\.description": "\(.*\)",\{0,1\}$/\1/p' "lang/$1.json"
}

# Una petición a $1 que debe llegar en el idioma $2: estado 200, cabecera
# Content-Language, <html lang>, la descripción en ese idioma y, en la página
# de Inertia, la prop locale y las traducciones de ese idioma (la prop `once`
# translations:{locale}). Todas mandan Accept-Language: es, así que en las de
# inglés tiene que ganar ?lang.
responds_in() {
    local path=$1 locale=$2 response status headers description page
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
    description=$(description_in "$locale")
    [ -n "$description" ] || {
        echo "    lang/$locale.json no trae meta.description"
        return 1
    }
    grep -qF "<meta name=\"description\" content=\"$description\">" <<< "$response" || {
        echo "    $path: la descripción no está en $locale"
        return 1
    }
    page=$(grep -o '<script data-page="app"[^>]*>.*</script>' <<< "$response" || true)
    grep -q "\"props\":{.*\"locale\":\"$locale\"" <<< "$page" || {
        echo "    $path: la prop locale de la página no es $locale"
        return 1
    }
    grep -q "\"onceProps\":{[^}]*\"translations:$locale\"" <<< "$page" || {
        echo "    $path: la página no trae las traducciones de $locale (translations:$locale)"
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

# Lo que la aplicación guarda en storage/app (las fotos de los platos) vive en
# un volumen: tiene que seguir ahí cuando un despliegue recrea los
# contenedores, y el worker tiene que ver el mismo archivo que escribió la app.
uploads_survive_recreate() {
    in_app 'echo humo > storage/app/public/humo.txt' || return 1
    compose up --detach --no-build --no-deps --force-recreate app worker > /dev/null 2>&1 || {
        echo "    no se pudieron recrear app y worker"
        return 1
    }
    wait_for_up || {
        echo "    /up no volvió a responder tras recrear app"
        return 1
    }
    in_app 'test -f storage/app/public/humo.txt' || {
        echo "    el archivo de storage/app/public se perdió al recrear app"
        return 1
    }
    compose exec -T worker test -f storage/app/public/humo.txt || {
        echo "    worker no ve el archivo que escribió app"
        return 1
    }
    [ "$(curl --silent --max-time 10 "$base/storage/humo.txt" || true)" = humo ] || {
        echo "    /storage/humo.txt no sirve el archivo"
        return 1
    }
}

# Con una entrada que tarda (aquí, un sleep antes del exec) la revisión de
# salud no puede dar «sano»: el PID 1 todavía es el shell de la entrada, aunque
# su línea de comandos ya traiga queue:work o schedule:work. Corre el comando
# de cada servicio en un contenedor aparte y mira su estado durante 10 s (al
# arrancar, la revisión corre cada 2 s).
health_waits_for_entrypoint() {
    local service entry id state result=0 deadline
    local -a cmd ids=()
    for service in "$@"; do
        read -r -a cmd <<< "$(docker inspect --format '{{join .Config.Cmd " "}}' "$(compose ps --quiet "$service")")"
        # shellcheck disable=SC2016 # "$@" lo resuelve el shell del contenedor.
        id=$(compose run --detach --no-deps --entrypoint sh "$service" \
            -c 'sleep 60; exec "$@"' sh "${cmd[@]}" 2> /dev/null | tail -n 1) || {
            echo "    no se pudo arrancar $service con la entrada de prueba"
            return 1
        }
        ids+=("$service=$id")
    done
    deadline=$((SECONDS + 10))
    while [ "$result" = 0 ] && [ "$SECONDS" -lt "$deadline" ]; do
        for entry in "${ids[@]}"; do
            state=$(docker inspect --format '{{.State.Running}} {{.State.Health.Status}}' "${entry#*=}" 2> /dev/null || true)
            if [ "$state" != "true starting" ]; then
                echo "    ${entry%%=*}: con la entrada todavía en marcha quedó en «${state:-sin estado}»"
                result=1
            fi
        done
        sleep 1
    done
    for entry in "${ids[@]}"; do
        docker rm --force "${entry#*=}" > /dev/null 2>&1 || true
    done
    return "$result"
}

# Sano y además estable: $stable_wait s después de darse por sanos siguen
# corriendo y Docker no los reinició ni una vez.
still_running() {
    local service state
    while [ "$SECONDS" -lt $((healthy_at + stable_wait)) ]; do
        sleep 1
    done
    for service in "$@"; do
        state=$(docker inspect --format '{{.State.Status}} {{.RestartCount}}' "$(compose ps --all --quiet "$service")")
        [ "$state" = "running 0" ] || {
            echo "    $service quedó en «$state» (estado y reinicios)"
            return 1
        }
    done
}

# --- Seguridad HTTP (ADR 0014) -------------------------------------------------

# Una variable del entorno de la imagen, sin la entrada ni el .env.
image_env() {
    # shellcheck disable=SC2016 # $1 lo resuelve el shell del contenedor.
    docker run --rm --entrypoint sh "$image" -c 'printenv "$1" || true' sh "$1"
}

# Cabeceras y cuerpo de una petición a $1 desde este equipo, sin \r. Lo que
# sigue a $1 son opciones de curl (cabeceras de más).
page() {
    local path=$1
    shift
    curl --silent --show-error --include --max-time 10 "$@" "$base$path" | tr -d '\r'
}

# Lo mismo, pero desde dentro del contenedor de app: llega desde 127.0.0.1,
# el proxy de confianza de esta prueba. Las cabeceras son las de un proxy que
# recibió la petición por HTTPS para veniroldanillo.test.
page_via_trusted_proxy() {
    compose exec -T app curl --silent --show-error --include --max-time 10 \
        --header 'X-Forwarded-Proto: https' --header 'X-Forwarded-Host: veniroldanillo.test' \
        --header 'X-Forwarded-Port: 443' --header 'X-Forwarded-For: 203.0.113.7' \
        "http://127.0.0.1:8000$1" | tr -d '\r'
}

headers_of() {
    sed '/^$/q' <<< "$1"
}

# Valor de la cabecera $1 en la respuesta $2 (la primera, sin el nombre).
header_value() {
    headers_of "$2" | grep -i "^$1:" | head -n 1 | cut -d: -f2- | sed 's/^ *//'
}

security_headers() {
    local response expected
    response=$(page /) || return 1
    for expected in 'X-Content-Type-Options: nosniff' 'X-Frame-Options: DENY' \
        'Referrer-Policy: strict-origin-when-cross-origin'; do
        headers_of "$response" | grep -qixF "$expected" || {
            echo "    falta «$expected»"
            return 1
        }
    done
    header_value Permissions-Policy "$response" | grep -q 'geolocation=(self).*camera=()\|camera=().*geolocation=(self)' || {
        echo "    Permissions-Policy no deja la ubicación solo a este origen o no apaga la cámara"
        return 1
    }
}

# HSTS solo cuando la petición llegó por HTTPS a un proxy de confianza. Desde
# este equipo, aunque diga X-Forwarded-Proto: https, la app no le cree.
hsts_only_behind_trusted_proxy() {
    header_value Strict-Transport-Security "$(page_via_trusted_proxy /)" | grep -qx 'max-age=31536000; includeSubDomains' || {
        echo "    sin HSTS detrás del proxy de confianza"
        return 1
    }
    [ -z "$(header_value Strict-Transport-Security "$(page / --header 'X-Forwarded-Proto: https')")" ] || {
        echo "    HSTS por HTTP, desde una IP que no es de confianza"
        return 1
    }
}

# Las URL que genera la app (aquí, las de los assets de @vite) siguen al proxy
# de confianza y, a la petición siguiente del mismo worker, ya no.
urls_follow_trusted_proxy() {
    grep -q 'src="https://veniroldanillo.test/build/assets/' <<< "$(page_via_trusted_proxy /)" || {
        echo "    detrás del proxy de confianza las URL no salen con https://veniroldanillo.test"
        return 1
    }
    grep -q "src=\"$base/build/assets/" <<< "$(page / --header 'X-Forwarded-Proto: https' --header 'X-Forwarded-Host: veniroldanillo.test')" || {
        echo "    desde una IP que no es de confianza las URL siguieron sus X-Forwarded-*"
        return 1
    }
}

# Sesión, token CSRF e idioma (?lang fija la cookie): Secure y SameSite=Lax
# aunque el .env diga SESSION_SECURE_COOKIE=false.
secure_cookies() {
    local cookies
    cookies=$(headers_of "$(page '/?lang=en')" | grep -i '^set-cookie:') || true
    if [ "$(grep -c . <<< "$cookies")" -lt 3 ] || ! grep -qi '^set-cookie: locale=' <<< "$cookies"; then
        echo "    no llegaron la sesión, el token CSRF y el idioma: $cookies"
        return 1
    fi
    if grep -vi '; secure' <<< "$cookies" | grep -q .; then
        echo "    cookies sin Secure: $(grep -vi '; secure' <<< "$cookies")"
        return 1
    fi
    if grep -vi '; samesite=lax' <<< "$cookies" | grep -q .; then
        echo "    cookies sin SameSite=Lax: $(grep -vi '; samesite=lax' <<< "$cookies")"
        return 1
    fi
}

nonce_of() {
    sed -n "s/.*'nonce-\([A-Za-z0-9]*\)'.*/\1/p" <<< "$1"
}

# La política activa (no la de solo informe), sin nada en línea sin nonce, con
# el host del mapa de la imagen, y el mismo nonce en el HTML.
csp_with_nonce() {
    local response policy nonce
    response=$(page /) || return 1
    policy=$(header_value Content-Security-Policy "$response")
    [ -n "$policy" ] || {
        echo "    sin Content-Security-Policy"
        return 1
    }
    if grep -q "unsafe-inline\|unsafe-eval" <<< "$policy"; then
        echo "    la política permite código en línea: $policy"
        return 1
    fi
    grep -q "connect-src 'self' $map_origin" <<< "$policy" || {
        echo "    connect-src no nombra el mapa de la imagen ($map_origin): $policy"
        return 1
    }
    nonce=$(nonce_of "$policy")
    if [ -z "$nonce" ] \
        || ! grep -qF "<meta property=\"csp-nonce\" nonce=\"$nonce\">" <<< "$response" \
        || ! grep -qF "<script nonce=\"$nonce\">" <<< "$response" \
        || ! grep -q "<script type=\"module\" src=\"[^\"]*\" nonce=\"$nonce\"" <<< "$response"; then
        echo "    el HTML no lleva el nonce de la cabecera («$nonce»)"
        return 1
    fi
}

# Bajo Octane la app queda arrancada entre peticiones: el nonce no puede
# repetirse de una a la siguiente.
nonce_changes() {
    local i nonce previous=''
    for i in 1 2 3 4; do
        nonce=$(nonce_of "$(header_value Content-Security-Policy "$(page /)")")
        if [ -z "$nonce" ] || [ "$nonce" = "$previous" ]; then
            echo "    nonce vacío o repetido entre peticiones: «$nonce»"
            return 1
        fi
        previous=$nonce
    done
}

# El preconnect nombra el host del mapa que trae la imagen (no el del .env), y
# es el mismo mapa que quedó escrito en el JavaScript.
map_preconnect() {
    [ -n "$map_origin" ] || {
        echo "    la imagen no trae VITE_MAP_STYLE_URL en su entorno"
        return 1
    }
    grep -qF "<link rel=\"preconnect\" href=\"$map_origin\" crossorigin>" <<< "$(page /)" || {
        echo "    falta <link rel=\"preconnect\" href=\"$map_origin\" crossorigin>"
        return 1
    }
    in_app "grep -rqF '$map_style_url' public/build/assets" || {
        echo "    el JavaScript no trae el estilo $map_style_url"
        return 1
    }
}

# Solo las cabeceras de un archivo que sirve Caddy sin pasar por Laravel.
static_headers() {
    curl --silent --show-error --max-time 10 --output /dev/null --dump-header - "$base$1" | tr -d '\r'
}

# Caché de lo que sirve Caddy (config/octane.php): un año e immutable para los
# assets con hash, una semana y revalidación para las fuentes, y nosniff en
# los dos. Un asset que no existe no se guarda.
static_cache() {
    local asset headers expected
    asset=$(in_app 'ls public/build/assets/*.js | head -n 1') || return 1
    headers=$(static_headers "/${asset#public/}")
    expected='public, max-age=31536000, immutable'
    [ "$(header_value Cache-Control "$headers")" = "$expected" ] || {
        echo "    /${asset#public/}: Cache-Control no es «$expected»"
        return 1
    }
    headers_of "$headers" | grep -qix 'X-Content-Type-Options: nosniff' || {
        echo "    /${asset#public/}: sin nosniff"
        return 1
    }
    headers=$(static_headers /fonts/figtree-latin-400-700.woff2)
    expected='public, max-age=604800, must-revalidate'
    [ "$(header_value Cache-Control "$headers")" = "$expected" ] || {
        echo "    /fonts: Cache-Control no es «$expected»"
        return 1
    }
    [ -n "$(header_value ETag "$headers")" ] || {
        echo "    /fonts: sin ETag para revalidar"
        return 1
    }
    headers=$(static_headers /build/assets/no-existe.js)
    if header_value Cache-Control "$headers" | grep -q immutable; then
        echo "    un asset que no existe salió con caché de un año"
        return 1
    fi
}

# --- Ejecución -----------------------------------------------------------------

echo "Imagen $image, proyecto $project, $base"

# shellcheck disable=SC2016 # $(id -u) lo resuelve el shell del contenedor.
check "la imagen no corre como root" in_image 'test "$(id -u)" != 0'
check "la imagen no trae la entrada de desarrollo" in_image 'test ! -e /app/docker/entrypoint-dev.sh'
check "la imagen no trae un .env" in_image 'test ! -e /app/.env'
check "la imagen no trae Composer" in_image '! command -v composer > /dev/null'

# El mapa con que se compiló el JavaScript, que la imagen deja en su entorno.
map_style_url=$(image_env VITE_MAP_STYLE_URL)
map_origin=$(sed -nE 's#^(https?://[^/]+)/.*#\1#p' <<< "$map_style_url")

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
check "los registros salen por stderr aunque el .env diga otro canal" in_app 'php artisan config:show logging.default | grep -q stderr'
check "$requests peticiones alternando en y es" alternating_requests
check "cabeceras de seguridad en la página" security_headers
check "HSTS solo detrás del proxy de confianza" hsts_only_behind_trusted_proxy
check "URL con https detrás del proxy de confianza; desde otra IP, no" urls_follow_trusted_proxy
check "cookies Secure y SameSite=Lax aunque el .env diga otra cosa" secure_cookies
check "CSP activa con nonce y el host del mapa, sin nada en línea" csp_with_nonce
check "un nonce nuevo en cada petición bajo Octane" nonce_changes
check "preconnect al mapa de la imagen aunque el .env diga otro" map_preconnect
check "caché de assets y fuentes servidos por Caddy" static_cache
check "un archivo de storage/app/public sobrevive a recrear app y worker" uploads_survive_recreate
check "worker sano" wait_healthy worker
check "scheduler sano" wait_healthy scheduler
healthy_at=$SECONDS
check "worker y scheduler no se dan por sanos mientras corre la entrada" health_waits_for_entrypoint worker scheduler
check "worker y scheduler siguen arriba y sin reinicios a los $stable_wait s" still_running worker scheduler

echo
echo "$((total - failures)) de $total comprobaciones pasaron en $SECONDS s"
[ "$failures" = 0 ]
