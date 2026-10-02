#!/usr/bin/env bash
# Pruebas de scripts/deploy.sh. No necesitan Docker ni un servidor: cada caso
# arma una carpeta con un docker-compose.yml y un .env, y pone delante en el
# PATH un docker falso que anota cada llamada (con el APP_IMAGE que recibe por
# el entorno y el que hay en el .env en ese momento) y puede fallar en la que
# se le pida. Corren igual en Linux (CI) y en Git Bash:
#
#   bash tests/docker/deploy.test.sh
set -u

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/deploy.sh"

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

total=0
failures=0

old_image=ghcr.io/wokerjj/veni-roldanillo:0.1.0
new_image=ghcr.io/wokerjj/veni-roldanillo:0.2.0
# Lo que imprimiría `docker compose logs` tras una migración fallida.
private_log='SQLSTATE[23505]: ya existe la llave (phone)=(573001234567)'

# --- Preparación de cada caso ------------------------------------------------

new_project() {
    project="$root/$1"
    server="$project/server"
    bin="$project/bin"
    calls="$project/docker.calls"
    original="$project/env.original"
    out="$project/out"
    err="$project/err"
    status=0

    mkdir -p "$server" "$bin"
    : > "$calls"
    echo 'services: {}' > "$server/docker-compose.yml"
    write_env "APP_IMAGE=$old_image"

    # docker falso. Falla en el paso que diga FAKE_DOCKER_FAILS (pull, up,
    # health). Como el de verdad, `docker compose exec` lee su entrada estándar
    # hasta el final.
    cat > "$bin/docker" <<'SH'
#!/bin/sh
echo "$* [entorno=${APP_IMAGE:-} .env=$(sed -n 's/^APP_IMAGE=//p' .env)]" >> "$FAKE_DOCKER_CALLS"
case "$*" in
    "compose pull"*) step=pull ;;
    "compose up"*) step=up ;;
    "compose exec"*)
        step=health
        cat > /dev/null
        ;;
    "compose logs"*)
        step=logs
        echo "$FAKE_DOCKER_LOG"
        ;;
    *) step=otro ;;
esac
if [ "$step" = "${FAKE_DOCKER_FAILS:-ninguno}" ]; then
    echo "docker falso: fallo simulado en «$*»" >&2
    exit 1
fi
SH
    chmod +x "$bin/docker"
}

# Un .env con líneas alrededor de la que se le pase (o sin ella): comillas,
# espacios y los caracteres que una sustitución descuidada estropearía.
write_env() {
    {
        echo 'APP_NAME="Vení Roldanillo"'
        echo 'APP_KEY=base64:clave/de+prueba='
        if [ -n "$1" ]; then
            echo "$1"
        fi
        echo
        # shellcheck disable=SC2016 # Texto literal: nada se expande aquí.
        printf '%s\n' 'DB_PASSWORD="una clave con espacios, $signos, |barras| y \barras&"'
        echo '# APP_IMAGE=comentada: no se toca'
    } > "$server/.env"
    cp "$server/.env" "$original"
}

# Ejecuta el script en la carpeta del servidor. Las variables que se le
# antepongan (FAKE_DOCKER_FAILS=pull run_deploy …) llegan al docker falso.
# DEPLOY_TIMEOUT=0: si /up no responde a la primera, falla sin esperar.
run_deploy() {
    status=0
    (
        cd "$server" || exit 99
        PATH="$bin:$PATH" FAKE_DOCKER_CALLS="$calls" FAKE_DOCKER_LOG="$private_log" DEPLOY_TIMEOUT=0 \
            bash "$script" "$@"
    ) > "$out" 2> "$err" < /dev/null || status=$?
}

# Como llega por SSH cuando no se copia al servidor: bash lo lee de su entrada
# estándar, la misma que heredan los comandos que ejecuta.
run_deploy_from_stdin() {
    status=0
    (
        cd "$server" || exit 99
        PATH="$bin:$PATH" FAKE_DOCKER_CALLS="$calls" FAKE_DOCKER_LOG="$private_log" DEPLOY_TIMEOUT=0 \
            bash -s -- "$@" < "$script"
    ) > "$out" 2> "$err" || status=$?
}

# --- Afirmaciones --------------------------------------------------------------

fail() {
    echo "    $*"
    return 1
}

assert_ok() {
    [ "$status" = 0 ] || fail "terminó con estado $status; se esperaba 0"
}

assert_failed() {
    [ "$status" != 0 ] || fail "terminó con estado 0; se esperaba un fallo"
}

assert_env_untouched() {
    cmp -s "$server/.env" "$original" || fail "el .env cambió: $(diff "$original" "$server/.env" | tr '\n' ' ')"
}

# El .env es el original con una sola diferencia: la línea $1 pasó a ser $2
# (o, con $1 vacío, se agregó $2 al final tras una línea en blanco).
assert_env_only_changed() {
    local expected="$project/env.expected"
    if [ -n "$1" ]; then
        sed "s|^$1\$|$2|" "$original" > "$expected"
    else
        {
            cat "$original"
            echo
            echo "$2"
        } > "$expected"
    fi
    cmp -s "$server/.env" "$expected" || fail "el .env no es el esperado: $(diff "$expected" "$server/.env" | tr '\n' ' ')"
}

# Los pasos de docker, en orden y separados por espacios (pull up exec ps …).
assert_docker_steps() {
    local actual
    actual=$(sed -n 's/^compose \([a-z]*\).*/\1/p' "$calls" | paste -sd ' ' -)
    [ "$actual" = "$1" ] || fail "docker se llamó con «$actual»; se esperaba «$1»"
}

# La llamada del paso $1 se hizo con este APP_IMAGE en el entorno ($2) y este
# en el .env ($3).
assert_step_saw() {
    grep -q "^compose $1 .*\[entorno=$2 \.env=$3\]\$" "$calls" \
        || fail "«$1» no vio entorno=$2 y .env=$3: $(grep "^compose $1 " "$calls")"
}

assert_output_hides_logs() {
    ! grep -q 573001234567 "$out" "$err" || fail "la salida trae el registro de los contenedores"
}

# --- Casos ---------------------------------------------------------------------

con_una_imagen_invalida_no_hace_nada() {
    local image
    # shellcheck disable=SC2016 # Texto literal: lo que no debe llegar a ejecutarse.
    for image in 'ghcr.io/wokerjj/veni-roldanillo' 'ghcr.io/x/y:1.0.0|e' 'ghcr.io/x/y:1.0.0 otra' \
        'ghcr.io/x/y:1.0.0@sha256:corto' '$(id):1'; do
        run_deploy "$image"
        assert_failed || return 1
        grep -q 'Imagen inválida' "$err" || fail "«$image»: el mensaje no dice que la imagen es inválida" || return 1
    done
    assert_docker_steps '' || return 1
    assert_env_untouched || return 1
}

reemplaza_app_image_y_deja_las_demas_lineas() {
    run_deploy "$new_image"
    assert_ok || return 1
    assert_env_only_changed "APP_IMAGE=$old_image" "APP_IMAGE=$new_image" || return 1
    cmp -s "$server/.env.anterior" "$original" || fail ".env.anterior no es una copia del .env de antes" || return 1
    [ ! -e "$server/.env.nuevo" ] || fail "quedó el archivo temporal .env.nuevo"
}

agrega_app_image_si_no_estaba() {
    write_env ''
    run_deploy "$new_image"
    assert_ok || return 1
    assert_env_only_changed '' "APP_IMAGE=$new_image" || return 1
}

acepta_una_version_fijada_por_digest() {
    local pinned
    pinned="$new_image@sha256:$(printf '%064d' 0)"
    run_deploy "$pinned"
    assert_ok || return 1
    assert_env_only_changed "APP_IMAGE=$old_image" "APP_IMAGE=$pinned" || return 1
}

baja_la_imagen_antes_de_tocar_el_env() {
    run_deploy "$new_image"
    assert_ok || return 1
    assert_docker_steps 'pull up exec ps' || return 1
    assert_step_saw pull "$new_image" "$old_image" || return 1
    assert_step_saw up '' "$new_image" || return 1
}

si_falla_el_pull_el_env_queda_identico() {
    FAKE_DOCKER_FAILS=pull run_deploy "$new_image"
    assert_failed || return 1
    assert_docker_steps 'pull' || return 1
    assert_env_untouched || return 1
}

si_falla_el_arranque_vuelve_al_env_anterior() {
    FAKE_DOCKER_FAILS=up run_deploy "$new_image"
    assert_failed || return 1
    assert_step_saw up '' "$new_image" || return 1
    assert_env_untouched || return 1
}

si_up_no_responde_vuelve_al_env_anterior() {
    FAKE_DOCKER_FAILS=health run_deploy "$new_image"
    assert_failed || return 1
    assert_step_saw exec '' "$new_image" || return 1
    assert_env_untouched || return 1
    cmp -s "$server/.env.anterior" "$original" || fail ".env.anterior no es una copia del .env de antes"
}

repetir_la_misma_version_no_reescribe_el_env() {
    run_deploy "$old_image"
    assert_ok || return 1
    assert_env_untouched || return 1
    [ ! -e "$server/.env.anterior" ] || fail "creó .env.anterior sin haber cambiado de versión"
}

los_registros_quedan_en_el_servidor_y_no_en_la_salida() {
    local step file probe
    for step in up health; do
        rm -rf "$server/deploy-logs"
        FAKE_DOCKER_FAILS=$step run_deploy "$new_image"
        assert_failed || return 1
        assert_output_hides_logs || return 1
        file=$(find "$server/deploy-logs" -type f 2> /dev/null | head -n 1)
        [ -n "$file" ] || fail "si falla $step no guarda el registro en deploy-logs/" || return 1
        grep -q 573001234567 "$file" || fail "el archivo no trae el registro de los contenedores" || return 1
        grep -q "deploy-logs/$(basename "$file")" "$err" || fail "la salida no dice dónde quedó el registro" || return 1
    done

    # En Git Bash los permisos de Windows no son estos: no se puede comprobar.
    probe="$project/probe"
    (umask 077 && : > "$probe")
    if [ "$(stat -c %a "$probe")" != 600 ]; then
        echo "       (permisos sin comprobar: aquí umask no los aplica)"
        return 0
    fi
    [ "$(stat -c %a "$file")" = 600 ] || fail "el registro quedó con permisos $(stat -c %a "$file"); se esperaba 600" || return 1
    [ "$(stat -c %a "$server/deploy-logs")" = 700 ] || fail "deploy-logs/ quedó con permisos $(stat -c %a "$server/deploy-logs"); se esperaba 700"
}

leido_por_la_entrada_estandar_llega_a_la_ultima_linea() {
    run_deploy_from_stdin "$new_image"
    assert_ok || return 1
    assert_docker_steps 'pull up exec ps' || return 1
    grep -q 'La app responde /up' "$out" || fail "no llegó al final: la entrada estándar se consumió antes"
}

# --- Ejecución -----------------------------------------------------------------

run_test() {
    total=$((total + 1))
    new_project "$1"

    if "$1"; then
        echo "ok     $1"
    else
        failures=$((failures + 1))
        echo "FALLA  $1"
        sed 's/^/    stderr: /' "$err"
    fi
}

run_test con_una_imagen_invalida_no_hace_nada
run_test reemplaza_app_image_y_deja_las_demas_lineas
run_test agrega_app_image_si_no_estaba
run_test acepta_una_version_fijada_por_digest
run_test baja_la_imagen_antes_de_tocar_el_env
run_test si_falla_el_pull_el_env_queda_identico
run_test si_falla_el_arranque_vuelve_al_env_anterior
run_test si_up_no_responde_vuelve_al_env_anterior
run_test repetir_la_misma_version_no_reescribe_el_env
run_test los_registros_quedan_en_el_servidor_y_no_en_la_salida
run_test leido_por_la_entrada_estandar_llega_a_la_ultima_linea

echo
echo "$((total - failures)) de $total pruebas pasaron"
[ "$failures" = 0 ]
