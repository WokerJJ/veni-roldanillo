#!/usr/bin/env bash
# Pruebas de docker/entrypoint-dev.sh. No necesitan Docker, PHP ni red: cada
# caso arma una carpeta temporal con un composer.lock y un vendor/ vacío, y pone
# delante en el PATH un composer falso que anota cada llamada. Corren igual en
# Linux (CI) y en Git Bash:
#
#   bash tests/docker/entrypoint-dev.test.sh
set -u

# El entrypoint se niega a instalar como root: casi todos los casos fallarían
# por eso y no por lo que prueban.
if [ "$(id -u)" = 0 ]; then
    echo "Estas pruebas no corren como root: usá un usuario sin privilegios." >&2
    exit 1
fi

entrypoint="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docker/entrypoint-dev.sh"

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

total=0
failures=0

# --- Preparación de cada caso ------------------------------------------------

new_project() {
    project="$root/$1"
    bin="$project/bin"
    calls="$project/composer.calls"
    out="$project/out"
    err="$project/err"
    status=0

    mkdir -p "$project/app/vendor" "$bin"
    : > "$calls"
    write_lock lock-a

    # composer falso. Si FAKE_COMPOSER_EXIT no es 0 falla antes de escribir
    # installed.json, como una descarga que se corta a la mitad.
    cat > "$bin/composer" <<'SH'
#!/bin/sh
echo "$*" >> "$FAKE_COMPOSER_CALLS"
mkdir -p vendor/composer
echo '<?php' > vendor/autoload.php
if [ "${FAKE_COMPOSER_EXIT:-0}" != 0 ]; then
    echo "composer falso: fallo simulado" >&2
    exit "$FAKE_COMPOSER_EXIT"
fi
echo "paquetes de $(cat composer.lock)" > vendor/composer/installed.json
# Un cambio de rama mientras se instalaba: composer.lock ya es otro.
if [ -n "${FAKE_COMPOSER_NEW_LOCK:-}" ]; then
    echo "$FAKE_COMPOSER_NEW_LOCK" > composer.lock
fi
SH
    chmod +x "$bin/composer"

    # Git Bash no trae flock. Donde existe (Linux, CI) se usa el de verdad.
    if ! command -v flock > /dev/null 2>&1; then
        printf '#!/bin/sh\nexit 0\n' > "$bin/flock"
        chmod +x "$bin/flock"
    fi
}

write_lock() {
    echo "$1" > "$project/app/composer.lock"
}

# Sustituye `id`: el entrypoint cree que corre con ese usuario.
fake_user() {
    printf '#!/bin/sh\necho %s\n' "$1" > "$bin/id"
    chmod +x "$bin/id"
}

# Ejecuta el entrypoint con un comando reconocible. Las variables que se le
# antepongan (FAKE_COMPOSER_EXIT=1 run_entrypoint) llegan al entrypoint.
run_entrypoint() {
    status=0
    (
        cd "$project/app" || exit 99
        PATH="$bin:$PATH" FAKE_COMPOSER_CALLS="$calls" \
            sh "$entrypoint" echo comando-ejecutado
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

assert_composer_calls() {
    local actual
    actual=$(wc -l < "$calls" | tr -d ' ')
    [ "$actual" = "$1" ] || fail "composer se ejecutó $actual veces; se esperaban $1"
}

assert_command_ran() {
    grep -q comando-ejecutado "$out" || fail "no ejecutó el comando"
}

assert_command_did_not_run() {
    ! grep -q comando-ejecutado "$out" || fail "ejecutó el comando y no debía"
}

assert_stderr_has() {
    grep -q -- "$1" "$err" || fail "el mensaje de error no menciona: $1"
}

assert_no_stamp() {
    local stamps
    stamps=$(find "$project/app/vendor" -maxdepth 1 -name '*.sha256')
    [ -z "$stamps" ] || fail "quedó un sello: $stamps"
}

assert_vendor_untouched() {
    local entries
    entries=$(ls -A "$project/app/vendor")
    [ -z "$entries" ] || fail "se escribió en vendor/: $entries"
}

# --- Casos ---------------------------------------------------------------------

al_dia_no_reinstala() {
    run_entrypoint
    assert_ok || return 1
    assert_composer_calls 1 || return 1
    assert_command_ran || return 1

    run_entrypoint
    assert_ok || return 1
    assert_composer_calls 1 || return 1
    assert_command_ran
}

# `docker compose exec app composer install` en otra rama cambia vendor/ sin
# pasar por el entrypoint; al volver a la rama anterior, composer.lock coincide
# con el sello pero lo instalado es de la otra.
reinstala_si_installed_json_cambio_aunque_el_lock_coincida() {
    run_entrypoint
    assert_composer_calls 1 || return 1

    echo "paquetes de lock-b" > "$project/app/vendor/composer/installed.json"

    run_entrypoint
    assert_ok || return 1
    assert_composer_calls 2 || return 1
    assert_command_ran || return 1

    # El sello nuevo describe lo que quedó instalado: ya no hay nada que hacer.
    run_entrypoint
    assert_composer_calls 2
}

# Lo instalado es del lock anterior: el sello no puede describir el nuevo.
reinstala_si_el_lock_cambio_durante_la_instalacion() {
    FAKE_COMPOSER_NEW_LOCK=lock-b run_entrypoint
    assert_ok || return 1
    assert_composer_calls 1 || return 1

    run_entrypoint
    assert_ok || return 1
    assert_composer_calls 2 || return 1
    assert_command_ran
}

no_deja_sello_si_composer_falla() {
    run_entrypoint
    assert_composer_calls 1 || return 1

    write_lock lock-b
    FAKE_COMPOSER_EXIT=3 run_entrypoint
    assert_failed || return 1
    assert_composer_calls 2 || return 1
    assert_command_did_not_run || return 1
    assert_no_stamp || return 1
    assert_stderr_has 'VENI_SKIP_INSTALL=1' || return 1
    assert_stderr_has '--entrypoint' || return 1

    # De vuelta en el lock anterior, vendor/ quedó a medias: hay que reinstalar
    # aunque composer.lock sea el mismo de la última instalación completa.
    write_lock lock-a
    run_entrypoint
    assert_ok || return 1
    assert_composer_calls 3 || return 1
    assert_command_ran
}

como_root_no_instala_y_avisa() {
    fake_user 0

    run_entrypoint
    assert_failed || return 1
    assert_composer_calls 0 || return 1
    assert_command_did_not_run || return 1
    assert_vendor_untouched || return 1
    assert_stderr_has 'root'
}

con_archivos_de_otro_dueno_no_instala_y_avisa() {
    # Para el usuario 4242 todo lo que hay en vendor/ es de otro.
    fake_user 4242

    run_entrypoint
    assert_failed || return 1
    assert_composer_calls 0 || return 1
    assert_command_did_not_run || return 1
    assert_stderr_has 'otro usuario' || return 1
    assert_stderr_has 'chown -R 4242:4242 vendor'
}

con_escape_ejecuta_el_comando_sin_instalar() {
    VENI_SKIP_INSTALL=1 run_entrypoint
    assert_ok || return 1
    assert_composer_calls 0 || return 1
    assert_vendor_untouched || return 1
    assert_command_ran
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

run_test al_dia_no_reinstala
run_test reinstala_si_installed_json_cambio_aunque_el_lock_coincida
run_test reinstala_si_el_lock_cambio_durante_la_instalacion
run_test no_deja_sello_si_composer_falla
run_test como_root_no_instala_y_avisa
run_test con_archivos_de_otro_dueno_no_instala_y_avisa
run_test con_escape_ejecuta_el_comando_sin_instalar

echo
echo "$((total - failures)) de $total pruebas pasaron"
[ "$failures" = 0 ]
