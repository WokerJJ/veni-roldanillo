#!/usr/bin/env bash
# Pruebas de docker/entrypoint-prod.sh. No necesitan Docker ni PHP: cada caso
# pone delante en el PATH un php falso que anota cada llamada y puede fallar en
# la que se le pida. Corren igual en Linux (CI) y en Git Bash:
#
#   bash tests/docker/entrypoint-prod.test.sh
set -u

entrypoint="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docker/entrypoint-prod.sh"

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

total=0
failures=0

# --- Preparación de cada caso ------------------------------------------------

new_project() {
    project="$root/$1"
    bin="$project/bin"
    calls="$project/php.calls"
    out="$project/out"
    err="$project/err"
    status=0

    mkdir -p "$project/app" "$bin"
    : > "$calls"

    # php falso: anota los argumentos y falla si la llamada contiene el texto
    # de FAKE_PHP_FAILS (por ejemplo «optimize»).
    cat > "$bin/php" <<'SH'
#!/bin/sh
echo "$*" >> "$FAKE_PHP_CALLS"
case "$*" in
    *"${FAKE_PHP_FAILS:-ninguna}"*)
        echo "php falso: fallo simulado en «$*»" >&2
        exit 1
        ;;
esac
SH
    chmod +x "$bin/php"
}

# Ejecuta el entrypoint con un comando reconocible. Las variables que se le
# antepongan (FAKE_PHP_FAILS=optimize run_entrypoint) llegan al entrypoint.
run_entrypoint() {
    status=0
    (
        cd "$project/app" || exit 99
        PATH="$bin:$PATH" FAKE_PHP_CALLS="$calls" \
            sh "$entrypoint" echo comando-ejecutado "con espacios"
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

# Las llamadas a php, en orden y separadas por «;».
assert_php_calls() {
    local actual
    actual=$(paste -sd ';' "$calls")
    [ "$actual" = "$1" ] || fail "php se llamó con «$actual»; se esperaba «$1»"
}

assert_command_ran() {
    grep -qx 'comando-ejecutado con espacios' "$out" || fail "no ejecutó el comando con sus argumentos"
}

assert_command_did_not_run() {
    ! grep -q comando-ejecutado "$out" || fail "ejecutó el comando y no debía"
}

# --- Casos ---------------------------------------------------------------------

prepara_laravel_y_despues_ejecuta_el_comando() {
    run_entrypoint
    assert_ok || return 1
    assert_php_calls 'artisan optimize;artisan storage:link --force' || return 1
    assert_command_ran || return 1
}

si_optimize_falla_no_arranca() {
    FAKE_PHP_FAILS=optimize run_entrypoint
    assert_failed || return 1
    assert_php_calls 'artisan optimize' || return 1
    assert_command_did_not_run || return 1
}

si_storage_link_falla_no_arranca() {
    FAKE_PHP_FAILS=storage:link run_entrypoint
    assert_failed || return 1
    assert_php_calls 'artisan optimize;artisan storage:link --force' || return 1
    assert_command_did_not_run || return 1
}

con_escape_ejecuta_el_comando_sin_preparar() {
    VENI_SKIP_OPTIMIZE=1 run_entrypoint
    assert_ok || return 1
    assert_php_calls '' || return 1
    assert_command_ran || return 1
}

con_un_env_ilegible_no_arranca_y_avisa() {
    echo 'APP_KEY=' > "$project/app/.env"
    chmod 000 "$project/app/.env"
    # Como root, o en Git Bash (Windows no aplica estos permisos), el archivo
    # se sigue pudiendo leer: el caso no se puede armar.
    if [ -r "$project/app/.env" ]; then
        echo "       (omitida: aquí chmod 000 no impide leer el archivo)"
        return 0
    fi

    run_entrypoint
    assert_failed || return 1
    assert_php_calls '' || return 1
    assert_command_did_not_run || return 1
    grep -q 'no puede leer' "$err" || fail "el mensaje no dice que el .env no se puede leer"
}

con_un_env_legible_arranca() {
    echo 'APP_KEY=' > "$project/app/.env"

    run_entrypoint
    assert_ok || return 1
    assert_command_ran || return 1
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

run_test prepara_laravel_y_despues_ejecuta_el_comando
run_test si_optimize_falla_no_arranca
run_test si_storage_link_falla_no_arranca
run_test con_escape_ejecuta_el_comando_sin_preparar
run_test con_un_env_ilegible_no_arranca_y_avisa
run_test con_un_env_legible_arranca

echo
echo "$((total - failures)) de $total pruebas pasaron"
[ "$failures" = 0 ]
