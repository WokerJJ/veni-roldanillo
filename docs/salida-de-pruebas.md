# Plan de salida de pruebas: la imagen corriendo en tu computador, con un túnel de Cloudflare

> Estado: **plan, sin ejecutar**. Es el paso intermedio antes del servidor de producción de [`despliegue.md`](despliegue.md), que sigue desactivado. Sirve para tres cosas: probar la app de verdad, mostrársela a los dueños y llenar la base de datos con fichas reales (modo Campo, [ADR 0048](adr/0048-modo-campo-captura-en-el-local.md)).

## La idea en una frase

La imagen `ghcr.io/wokerjj/veni-roldanillo:X.Y.Z` corre con Docker en tu computador, y un túnel de Cloudflare (`cloudflared`) la publica por HTTPS en `veniroldanillo.co.uk`, sin abrir puertos en tu casa. El `.co` queda para cuando haya datos y financiación: ese día los datos pasan a un servidor y el dominio cambia con una variable.

## Qué ya está resuelto y qué no

| Pieza | Estado |
| --- | --- |
| Imagen de producción (FrankenPHP + Octane, assets compilados) | Publicada en GHCR en cada release. Última: 0.6.0; hay un PR de la 0.7.0 abierto (#118) |
| Prueba de humo de la imagen en el CI | Activa |
| `docker-compose.yml` de producción, migraciones al arrancar, `/up` | Listo |
| `deploy.sh` (bajar, migrar, comprobar `/up`, volver el `.env`) | Listo, probado con un `docker` falso. **Corre por bash**: en Windows, con WSL2 o Git Bash |
| `deploy.yml` (despliegue por SSH desde GitHub) | **No aplica**: tu computador no es un servidor con SSH. El despliegue es a mano con `deploy.sh` |
| HTTPS | Lo pone Cloudflare; la app sirve HTTP en `127.0.0.1:8000` y confía en el túnel (ADR 0014) |
| Primer administrador | **Hecho** (#172): `php artisan veni:make-admin <correo>` |
| La app no se indexa en buscadores | **Hecho** (#172): `ROBOTS_NOINDEX=true` pone `X-Robots-Tag: noindex, nofollow, noarchive` en todas las respuestas |
| Copia de seguridad de la base y del volumen `app_storage` | Descrita, sin implementar |
| Mapa con versión fija en `tiles.<dominio>` | No existe: la imagen lleva la demo pública de `veni-mapa` (sigue su rama `main`). Para pruebas sirve |

## Decisiones ya tomadas

- **`veniroldanillo.co.uk`** es el dominio de pruebas, de la demostración a dueños y de la carga de datos. **`veniroldanillo.co`** será el definitivo.
- **Dónde corre:** tu computador con Docker Desktop (WSL2) y `cloudflared`.
- **Solo es válido un host:** la app atiende únicamente el de `APP_URL` (otro `Host` responde 400). Cambiar de dominio es cambiar `APP_URL` y reiniciar; las únicas cadenas que nombran el `.co` en el código son la URL del mapa (`tiles.veniroldanillo.co`, que se compila en la imagen) y el correo de la política de datos (`privacidad@veniroldanillo.co`, de configuración).

## Riesgos de que sea tu computador

1. **Disponibilidad.** Solo está en línea mientras el equipo esté encendido, sin suspenderse y con internet. Para una demostración a un dueño, avisar y probar antes. No es un servicio para clientes.
2. **Datos reales de personas** (nombre, celular y rol de quien autoriza; WhatsApp de negocios). Ley 1581: disco con **BitLocker**, sesión de Windows con contraseña, y la copia de seguridad cifrada. No dejar `.env` ni volcados de la base en carpetas sincronizadas (OneDrive, Drive).
3. **El texto con que el dueño autoriza** en el modo Campo es provisional (versión 0.1) hasta que un abogado lo revise. Mientras tanto, el uso con negocios reales es **de prueba y con su consentimiento verbal**, y se registra como tal.
4. **Exposición.** El túnel no abre puertos, pero publica `/admin` y `/campo` en internet. Las defensas ya existentes (login con límite de intentos, `FieldSubmissionPolicy`) se refuerzan con **Cloudflare Access** (gratis) delante de `/admin*` y `/campo*`: código al correo, antes de llegar a la app.
5. **Un solo equipo, un solo disco.** Sin copia, un fallo pierde todo lo capturado. La copia es parte del plan, no un extra.

## Checklist

### A. Antes de encender nada (código y documentación; PR propio)
- [x] **Comando para crear el primer administrador** (#172): `php artisan veni:make-admin <correo>`, que pide la contraseña sin dejarla en el historial, la deja con `must_change_password`, y rechaza si el correo ya existe. Con su prueba.
- [x] **`noindex` configurable** (#172): variable `ROBOTS_NOINDEX=true`; con ella todas las respuestas llevan `X-Robots-Tag: noindex, nofollow` y `/robots.txt` dice `Disallow: /`. Con su prueba. En el `.co` definitivo se apaga.
- [x] **El correo de la política de datos** (#172): sale de la variable `VENI_PRIVACY_CONTACT_EMAIL` (por defecto `privacidad@example.test`). **Falta** ponerle en el `.env` un correo real que leas: con Cloudflare Email Routing, `privacidad@veniroldanillo.co.uk` reenviado a tu Gmail.
- [ ] **Fusionar la release 0.7.0** (PR #118: incluye el modo Campo etapa 1, la lista sin señal y lo del apartado A) y esperar a que se publique su imagen. La 0.6.0 **no** tiene `/campo`: para llenar la base hace falta la 0.7.0 o posterior.

### B. Cloudflare
- [ ] Terminar el registro de `veniroldanillo.co.uk` (tipo de registrante: *Non-UK Individual*) y activar la privacidad del WHOIS.
- [ ] Zero Trust → **Networks → Tunnels** → crear el túnel `veni` y copiar su token. *Public hostname*: `veniroldanillo.co.uk` → `http://localhost:8000`. Cloudflare crea el registro DNS solo.
- [ ] SSL/TLS en modo **Full** y *Always Use HTTPS*.
- [ ] **Access**: aplicación para `veniroldanillo.co.uk/admin*` y `/campo*`, con una política «solo estos correos» (el tuyo y, más adelante, el de quien capture).

### C. Tu computador (una sola vez)
- [ ] Windows con **BitLocker** activo.
- [ ] Docker Desktop con WSL2; WSL con Ubuntu (para `deploy.sh`).
- [ ] Que no se suspenda al enchufarlo: `powercfg /change standby-timeout-ac 0` (y apagar la hibernación de la pantalla si hace falta).
- [ ] `cloudflared` como **servicio de Windows** con el token del túnel (arranca con el equipo y se reconecta solo).
- [ ] Carpeta de despliegue **fuera** de OneDrive, p. ej. `C:\veni\` (en WSL: `/mnt/c/veni`, mejor dentro del sistema de archivos de WSL por rendimiento): `docker-compose.yml`, `scripts/deploy.sh` y el `.env` de la versión elegida.
- [ ] `.env` de producción (`docs/despliegue.md#qué-hay-en-el-servidor`), con estas diferencias respecto del servidor real:
  - `APP_URL=https://veniroldanillo.co.uk`
  - `TRUSTED_PROXIES`: la IP desde la que `cloudflared` llega al contenedor. Con Docker Desktop **no es la misma que en Linux**: se mide con la prueba de abajo, no se supone.
  - `APP_KEY`, `DB_PASSWORD`, `MEILISEARCH_KEY` generados (`openssl rand -base64 32`); `LOG_LEVEL=warning`.
  - `ROBOTS_NOINDEX=true`.
  - `VENI_PRIVACY_CONTACT_EMAIL=privacidad@veniroldanillo.co.uk` (cuando el alias de Cloudflare Email Routing esté activo).
- [ ] Paquete de GHCR público (o `docker login ghcr.io` con un token de lectura).

### D. Primer arranque
- [ ] `bash deploy.sh ghcr.io/wokerjj/veni-roldanillo:X.Y.Z@sha256:…` (con el digest del resumen de `docker.yml`).
- [ ] `curl -sI https://veniroldanillo.co.uk | grep -i strict-transport-security`: tiene que salir HSTS. Si no, `TRUSTED_PROXIES` no coincide.
- [ ] `/up` responde; el inicio carga con mapa y restaurantes; el celular instala la PWA.
- [ ] Crear el administrador (`veni:make-admin`); entrar a `/admin` pasando por Access.
- [ ] Una captura de prueba completa desde el celular con `/campo` (el GPS exige HTTPS: el túnel lo da), el enlace de confirmación abierto como dueño, la aprobación en `/admin` y la ficha publicada.
- [ ] Borrar los datos de esa prueba (la ficha es ficticia o se oculta y se retira).

### E. Todos los días / cada versión
- [ ] **Copia de seguridad**: `pg_dump` de la base y copia del volumen `app_storage`, **cifradas**, a un disco externo o a un almacenamiento que no sea el mismo computador. Programada (Tarea del Programador de Windows), no a mano, y con una restauración probada una vez.
- [ ] Antes de cada versión con migraciones, un `pg_dump` (ya lo pide `despliegue.md`).
- [ ] Actualizar: nueva versión publicada → `deploy.sh` con su digest.
- [ ] Ver los registros: `docker compose logs app worker scheduler`.

## El día que se pase al `.co` y a un servidor
1. Servidor x86-64 y `despliegue.md` completo (`deploy.yml` activado, Caddy o túnel).
2. `pg_dump` de la base y copia de `app_storage` desde tu computador, restauración en el servidor.
3. `APP_URL=https://veniroldanillo.co`, el mapa versionado en `tiles.veniroldanillo.co` (hay que recompilar la imagen con `VITE_MAP_*`), `ROBOTS_NOINDEX=false`, el correo de privacidad del dominio.
4. El `.co.uk` pasa a redirigir al `.co` (regla de Cloudflare) o se retira.

## Lo que este plan no resuelve
- La revisión jurídica del texto de autorización y de las políticas, necesaria antes de usar el modo Campo con negocios reales de verdad.
- El correo saliente (la app no manda correos: las cuentas de dueño se entregan por celular).
- El mapa versionado y el monitoreo; entran con el servidor definitivo.
