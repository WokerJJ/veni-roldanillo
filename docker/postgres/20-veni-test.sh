#!/bin/sh
# Crea la base de pruebas (veni_test) con PostGIS. Es idempotente.
# PostgreSQL la ejecuta solo al inicializar un volumen vacío; si el volumen ya
# existe: docker compose exec db sh /docker-entrypoint-initdb.d/20-veni-test.sh
set -e

test_db="${POSTGRES_TEST_DB:-veni_test}"

exists=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -tAc "SELECT 1 FROM pg_database WHERE datname = '${test_db}'")

if [ "$exists" != "1" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        -c "CREATE DATABASE \"${test_db}\" OWNER \"${POSTGRES_USER}\""
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$test_db" \
    -c "CREATE EXTENSION IF NOT EXISTS postgis"
