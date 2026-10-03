# ADR 0014 · Seguridad HTTP: TLS en el proxy de delante, proxies de confianza explícitos y CSP con nonce

- Estado: aceptada
- Fecha: 2026-10-02
- Precisa: ADR 0013 (dejaba para #41 quién termina TLS y la seguridad HTTP) y ADR 0001 (Cloudflare delante).
- Afecta a: `docs/03-arquitectura.md` («Servicios» y «Mapa autohospedado»), `docs/04-seguridad-y-legal.md`, `docs/despliegue.md` y `README.md` («Frontend» y «Mapa»).

## Contexto

La imagen de producción (ADR 0013) sirve la app por HTTP en el puerto 8000, publicado solo en `127.0.0.1` del servidor. `docs/03-arquitectura.md` decía «HTTPS automático (Caddy) en producción» sin decir qué Caddy ni dónde. Con un proxy delante que termina TLS y sin más configuración, Laravel ve cada petición como HTTP y desde la IP del proxy: genera URL `http://`, las cookies salen sin `Secure` y un límite de peticiones por IP lo compartirían todos los usuarios.

Las revisiones de #1, #2, #4 y #8 dejaron anotado lo demás: el script en línea que aplica el tema antes de pintar, el límite de `PUT /locale`, lo que pide el mapa a una política de contenido (estilo, tiles, fuentes y sprites por `fetch` al host de veni-mapa y un worker), el `preconnect` al mapa que en la imagen no salía porque la variable solo llegaba al build, y la caché de los assets.

## Alternativas

- **TLS dentro del contenedor de la app** (Octane `--https`, el Caddy de FrankenPHP con certificados automáticos). Obliga a publicar 80 y 443 desde un contenedor que cada despliegue recrea: el desafío ACME y las conexiones se cortan en cada uno, los certificados necesitan su propio volumen y el usuario sin root no abre puertos por debajo del 1024 sin capacidades extra. Con Cloudflare delante (ADR 0001), además, el TLS del visitante ya termina antes.
- **TLS en un proxy del servidor** (Caddy instalado en el servidor o un túnel de Cloudflare) hacia `127.0.0.1:8000` (la elegida).
- **Confiar en cualquier proxy (`*`).** Hoy solo el propio servidor llega al puerto, pero un cambio en el compose (publicarlo en `0.0.0.0`) dejaría a cualquiera elegir su IP y su esquema: saltarse los límites por IP o hacerse pasar por HTTPS.
- **Un paquete de cabeceras y CSP** (spatie/laravel-csp, bepsvpt/secure-headers). Resuelven más casos de los que hay y suman configuración propia; la política cabe en una clase que se prueba completa.
- **`'unsafe-inline'` en `style-src`.** Era lo cómodo: la barra de progreso de Inertia, Vite en desarrollo y las páginas de error de Laravel insertan `<style>`. Inertia y Vite aceptan un nonce y las páginas de error se pueden reemplazar, así que no hace falta.
- **Hashes en lugar de nonce.** Sirven para el script fijo del tema, pero no para las etiquetas de Vite ni los `<style>` que se insertan después.
- **`'strict-dynamic'`.** No aporta: todos los scripts salen de este origen.

## Decisión

- **TLS termina en el proxy de delante, no en la app.** La imagen sigue sirviendo HTTP en el 8000 de `127.0.0.1`; delante va Caddy en el servidor o `cloudflared`, a elegir al preparar el servidor (`docs/despliegue.md`, «Delante de la app»).
- **Proxies de confianza explícitos.** `TRUSTED_PROXIES` (IP o rangos CIDR, separados por comas) dice de quién se aceptan `X-Forwarded-For`, `-Host`, `-Port` y `-Proto`; sin valor, de nadie, también en producción. `X-Forwarded-Prefix` y las de AWS no se aceptan. Un valor que no es una IP ni un rango detiene el arranque. `*` solo si se escribe, y no se recomienda.
- **Cookies seguras.** La imagen fija `SESSION_SECURE_COOKIE=true` (sesión, token CSRF e idioma con `Secure`), y el `.env` no lo cambia. `SameSite=Lax` explícito. Fuera de la imagen, la cookie del idioma lleva `Secure` cuando la petición llegó por HTTPS.
- **Cabeceras de seguridad** con un middleware propio, el primero del grupo global (también en errores y en el modo de mantenimiento): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` con la ubicación solo para este origen (la usará #10) y cámara, micrófono, pagos y demás apagados. HSTS de un año con `includeSubDomains` y sin `preload`, solo en producción y cuando la petición llegó por HTTPS. La imagen no manda `X-Powered-By`.
- **CSP con un nonce nuevo en cada petición** (`Vite::useCspNonce()` en un middleware, también bajo Octane, donde el servicio Vite sobrevive entre peticiones). Lo llevan el script del tema, las etiquetas de `@vite` y `<meta property="csp-nonce">`, de donde lo toman Vite (los CSS y módulos que carga después) e Inertia (su barra de progreso). La política:

  ```text
  default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…';
  img-src 'self' data: blob: <mapa>; font-src 'self'; connect-src 'self' <mapa>;
  worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'
  ```

  `<mapa>` es el origen de `VITE_MAP_STYLE_URL` y de `VITE_MAP_ROUTES_URL` (sin repetir); no hay dominios escritos en el código. `data:` y `blob:` en `img-src` son los íconos de los controles de MapLibre (en su CSS) y los sprites en navegadores sin `createImageBitmap`. El worker de MapLibre sale de este origen. En desarrollo se suman el servidor de Vite de `public/hot`, su websocket y `blob:` con ese servidor en `worker-src` (MapLibre arranca el worker de otro origen desde una URL blob que importa su módulo); `vite.config.ts` fija `host: 'localhost'` porque la IPv6 literal (`http://[::1]:5173`) no se puede nombrar en una CSP. `CSP_REPORT_ONLY=true` la manda como `Content-Security-Policy-Report-Only` (sin `frame-ancestors`, que ahí se ignora). Las páginas de error usan una base propia con el nonce; la página de depuración (`APP_DEBUG`) queda sin política.
- **El mapa llega al contenedor en ejecución.** Las URL del mapa son argumentos de build que comparten las etapas `assets` y `prod`: Vite las escribe en el JavaScript y la imagen las deja en su entorno, de donde Laravel las lee para el `preconnect` y la CSP. El `.env` no las cambia: la app nombra siempre el mismo mapa que trae el JavaScript.
- **Límite de `PUT /locale`:** 30 cambios por minuto por IP real del cliente; después, 429 con `Retry-After` y un aviso en el idioma de la petición.
- **Caché de lo que sirve Caddy** sin pasar por Laravel, con directivas que Octane le pasa desde `config/octane.php`: `/build/assets/*` un año e `immutable` (el nombre lleva el hash del contenido); `/fonts/*` una semana y después revalidación con ETag (los nombres no llevan hash, #5); solo si el archivo existe; y `nosniff` si la respuesta no lo trae.
- La prueba de humo de la imagen comprueba todo lo anterior bajo Octane.

## Consecuencias

- **Un servidor necesita un proxy con TLS antes de abrirse, y `TRUSTED_PROXIES` escrito para ese proxy.** Si falta o no coincide con la IP desde la que llega el proxy, la app no falla: ve todo como HTTP, sin HSTS, con URL `http://` y un único límite de peticiones para todos. Se comprueba desde fuera con HSTS (`docs/despliegue.md`). Si la red de Compose se recrea con otra subred, la IP del proxy cambia; el rango de las redes de Docker evita reconfigurar a cambio de confiar en todos los contenedores del servidor.
- **Ninguna página se puede mostrar en un iframe**, tampoco la demo dentro del tablero de avance local.
- **Cada origen nuevo pasa por la política:** otro host del mapa, Meilisearch desde el navegador, analítica, un CDN de assets (`ASSET_URL` en otro origen necesitaría ese origen y `blob:` en `worker-src`). Se cambia en `App\Support\ContentSecurityPolicy` con su prueba.
- `/up` es para máquinas: abierta en un navegador se ve sin estilos, porque la vista del framework pide Tailwind y una fuente a CDN que la CSP bloquea. El estado (200 o 500) no cambia.
- Las páginas de error tienen una base propia (`resources/views/errors/minimal.blade.php`): un cambio de Laravel en la suya no llega solo.
- La página de depuración no lleva CSP; solo existe con `APP_DEBUG=true`, que la imagen de producción no permite.
- Las fuentes nuevas tardan hasta una semana en llegar a quien ya las tenía; con nombres con hash (#5) pasarían a `immutable`.
