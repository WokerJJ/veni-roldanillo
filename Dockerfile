# syntax=docker/dockerfile:1

# Una sola imagen para app, worker y scheduler (docs/03-arquitectura.md).
# Etapas: base → dev (desarrollo local) | vendor + assets → prod.

ARG PHP_IMAGE=dunglas/frankenphp:1.12-php8.4-trixie
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
# base: FrankenPHP (PHP 8.4) con las extensiones del proyecto y usuario sin root
# ---------------------------------------------------------------------------
FROM ${PHP_IMAGE} AS base

ARG UID=1000
ARG GID=1000

ENV TZ=America/Bogota \
    COMPOSER_HOME=/tmp/composer

RUN install-php-extensions bcmath intl pcntl pdo_pgsql zip \
    && groupadd --gid "${GID}" app \
    && useradd --uid "${UID}" --gid app --create-home --shell /bin/bash app \
    # Caddy guarda certificados y configuración aquí: el usuario sin root debe poder escribir.
    && chown -R app:app /data/caddy /config/caddy

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl --fail --silent --output /dev/null http://127.0.0.1:8000/up || exit 1

# ---------------------------------------------------------------------------
# dev: el código se monta como volumen; las dependencias se instalan al arrancar
# ---------------------------------------------------------------------------
FROM base AS dev

RUN cp "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

COPY --chmod=0755 docker/entrypoint-dev.sh /usr/local/bin/entrypoint-dev

USER app

ENTRYPOINT ["entrypoint-dev"]
# --max-requests=1 reinicia el worker tras cada petición para ver los cambios sin reiniciar el contenedor.
CMD ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=8000", "--max-requests=1"]

# ---------------------------------------------------------------------------
# vendor: dependencias de Composer sin las de desarrollo
# ---------------------------------------------------------------------------
FROM base AS vendor

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --no-autoloader --prefer-dist

COPY . .
RUN composer dump-autoload --no-dev --optimize \
    && php artisan package:discover --ansi

# ---------------------------------------------------------------------------
# assets: compilación de Vite
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS assets

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY vite.config.ts tsconfig.json ./
COPY resources ./resources
# Tokens y logos de la marca que importan el CSS y los componentes.
COPY brand/tokens.css ./brand/tokens.css
COPY brand/logo ./brand/logo
RUN npm run build

# ---------------------------------------------------------------------------
# prod: runtime mínimo, sin herramientas de compilación ni secretos
# ---------------------------------------------------------------------------
FROM base AS prod

ENV APP_ENV=production \
    APP_DEBUG=false

RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && rm /usr/bin/composer

COPY --from=vendor --chown=app:app /app /app
COPY --from=assets --chown=app:app /app/public/build /app/public/build

# El worker de Octane para FrankenPHP se deja listo en la imagen.
RUN cp vendor/laravel/octane/src/Commands/stubs/frankenphp-worker.php public/frankenphp-worker.php \
    && chown app:app public/frankenphp-worker.php

USER app

CMD ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=8000"]
