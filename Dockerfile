# syntax=docker/dockerfile:1

# Una sola imagen para app, worker y scheduler (docs/03-arquitectura.md).
# Etapas: base → dev (desarrollo local) | vendor + assets → prod.

# Las imágenes de base van fijadas por digest: una etiqueta se puede volver a
# publicar con otro contenido, y la imagen de una release tiene que salir de
# las mismas bases que pasaron la CI. Dependabot propone los digests nuevos
# (.github/dependabot.yml), y por eso van escritas en cada FROM y no en un ARG.

# Mapa de veni-mapa (ADR 0007), con la demo publicada por defecto; en
# producción se fija una release con --build-arg (o en el .env que lee docker
# compose). Son públicas. Las usan dos etapas: assets, donde Vite las escribe
# en el JavaScript, y prod, que las deja en el entorno del contenedor para que
# Laravel adelante la conexión con ese host y la CSP lo deje pedir el mapa.
# Así la app en ejecución nombra siempre el mismo mapa que trae el JavaScript.
ARG VITE_MAP_STYLE_URL="https://wokerjj.github.io/veni-mapa/style/veni-{theme}-{locale}.json"
ARG VITE_MAP_ROUTES_URL="https://wokerjj.github.io/veni-mapa/roldanillo-rutas.json"

# ---------------------------------------------------------------------------
# composer: solo aporta el binario a las etapas que instalan dependencias
# ---------------------------------------------------------------------------
FROM composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer

# ---------------------------------------------------------------------------
# base: FrankenPHP (PHP 8.4) con las extensiones del proyecto y usuario sin root
# ---------------------------------------------------------------------------
FROM dunglas/frankenphp:1.12-php8.4-trixie@sha256:035fcb2fab91aacf77d70ee555d51b9bb084d057b16cf8a644bf1f93e28d4e3e AS base

ARG UID=1000
ARG GID=1000

ENV TZ=America/Bogota \
    COMPOSER_HOME=/tmp/composer

RUN install-php-extensions bcmath intl pcntl pdo_pgsql zip \
    && groupadd --gid "${GID}" app \
    && useradd --uid "${UID}" --gid app --create-home --shell /bin/bash app \
    # Caddy guarda certificados y configuración aquí: el usuario sin root debe poder escribir.
    && chown -R app:app /data/caddy /config/caddy

WORKDIR /app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl --fail --silent --output /dev/null http://127.0.0.1:8000/up || exit 1

# ---------------------------------------------------------------------------
# dev: el código se monta como volumen; las dependencias se instalan al arrancar
# ---------------------------------------------------------------------------
FROM base AS dev

# La caché de descargas de Composer va en su propio volumen: al borrar el
# volumen vendor, la reinstalación no descarga todo otra vez.
ENV COMPOSER_CACHE_DIR=/var/cache/composer

RUN cp "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini" \
    # OPcache revisa cada archivo en cada petición: por defecto espera 2 s y
    # serviría el código anterior justo después de guardar un cambio.
    && echo 'opcache.revalidate_freq=0' > "$PHP_INI_DIR/conf.d/zz-dev.ini" \
    # vendor/ y la caché de Composer se montan como volúmenes con nombre
    # (docker-compose.override.yml): Docker los crea con el dueño de estos
    # directorios y Composer escribe sin root.
    && install -d -o app -g app /app/vendor "$COMPOSER_CACHE_DIR"

COPY --from=composer /usr/bin/composer /usr/bin/composer
COPY --chmod=0755 docker/entrypoint-dev.sh /usr/local/bin/entrypoint-dev

USER app

ENTRYPOINT ["entrypoint-dev"]
# Modo clásico de FrankenPHP: cada petición arranca Laravel con el código del
# momento. Los workers de Octane (producción) guardan la aplicación ya arrancada
# y, tras editar rutas o configuración, seguían respondiendo con las anteriores;
# su --watch no recibe eventos de un montaje de Docker Desktop en Windows.
CMD ["frankenphp", "php-server", "--root", "public/", "--listen", ":8000", "--access-log"]

# ---------------------------------------------------------------------------
# vendor: dependencias de Composer sin las de desarrollo
# ---------------------------------------------------------------------------
FROM base AS vendor

COPY --from=composer /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --no-autoloader --prefer-dist

COPY . .
# docker/ no va dentro de /app: la entrada de desarrollo y el script de la base
# de pruebas no se usan en producción, y la entrada de producción se copia
# aparte en la etapa prod, fuera de la aplicación. No se excluye en
# .dockerignore porque las etapas dev y prod copian de ahí.
RUN rm -rf docker \
    && composer dump-autoload --no-dev --optimize \
    && php artisan package:discover --ansi

# ---------------------------------------------------------------------------
# assets: compilación de Vite
# ---------------------------------------------------------------------------
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS assets

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY vite.config.ts tsconfig.json ./
COPY resources ./resources
# Tokens y logos de la marca que importan el CSS y los componentes, y los
# íconos de la app instalable que la compilación copia a public/build/icons
# (.dockerignore solo deja pasar esos).
COPY brand/tokens.css ./brand/tokens.css
COPY brand/logo ./brand/logo
COPY brand/png ./brand/png
# Los textos de la página sin conexión: su versión en el precache de la PWA
# depende de ellos (vite.config.ts).
COPY lang ./lang

# Mapa de veni-mapa (arriba, al principio del archivo). Vite escribe estas URL
# en el JavaScript al compilar, y el .env no entra en la imagen: llegan como
# argumentos de build. {theme} y {locale} los reemplaza la app
# (resources/js/map/styleUrl.ts).
ARG VITE_MAP_STYLE_URL
ARG VITE_MAP_ROUTES_URL

RUN npm run build

# ---------------------------------------------------------------------------
# prod: runtime mínimo, sin herramientas de compilación ni secretos
# ---------------------------------------------------------------------------
FROM base AS prod

# Inertia DevTools graba cada petición en disco: nunca en producción.
# Los registros de Laravel van a stderr, es decir a `docker compose logs`: un
# archivo dentro del contenedor se pierde cada vez que un despliegue lo recrea.
# Las cookies (sesión, token CSRF e idioma) solo viajan por HTTPS (ADR 0014).
# Como con APP_ENV, el .env no puede cambiar estos valores: Laravel no pisa una
# variable que ya trae el entorno.
ENV APP_ENV=production \
    APP_DEBUG=false \
    INERTIA_DEVTOOLS_ENABLED=false \
    LOG_CHANNEL=stderr \
    SESSION_SECURE_COOKIE=true

# Composer no llega a esta etapa: solo lo copian dev y vendor.
# expose_php: sin la cabecera X-Powered-By, que anuncia la versión exacta de
# PHP a quien busque una con fallas conocidas (php.ini-production la deja).
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && echo 'expose_php = Off' > "$PHP_INI_DIR/conf.d/zz-prod.ini"

# De docker/ solo entra la entrada de producción, y en /usr/local/bin (de
# root): el usuario de la aplicación la ejecuta pero no puede reescribirla.
COPY --chmod=0755 docker/entrypoint-prod.sh /usr/local/bin/entrypoint-prod

COPY --from=vendor --chown=app:app /app /app
COPY --from=assets --chown=app:app /app/public/build /app/public/build
# El service worker de la PWA va en la raíz, para que su alcance sea todo el
# sitio (vite.config.ts).
COPY --from=assets --chown=app:app /app/public/sw.js /app/public/sw.js

# Las mismas URL del mapa con que se compiló el JavaScript, en el entorno del
# contenedor (config/services.php): la vista raíz adelanta la conexión con ese
# host y la CSP lo deja pedir. Como APP_ENV, el .env no puede cambiarlas: un
# valor distinto en el servidor nombraría un mapa que el JavaScript no usa.
ARG VITE_MAP_STYLE_URL
ARG VITE_MAP_ROUTES_URL
ENV VITE_MAP_STYLE_URL=${VITE_MAP_STYLE_URL} \
    VITE_MAP_ROUTES_URL=${VITE_MAP_ROUTES_URL}

# El worker de Octane para FrankenPHP se deja listo en la imagen.
RUN cp vendor/laravel/octane/src/Commands/stubs/frankenphp-worker.php public/frankenphp-worker.php \
    && chown app:app public/frankenphp-worker.php

USER app

# Con el .env ya montado, la entrada guarda en caché configuración, rutas,
# vistas y eventos (php artisan optimize) y enlaza public/storage; después
# ejecuta el comando del servicio.
ENTRYPOINT ["entrypoint-prod"]
CMD ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=8000"]
