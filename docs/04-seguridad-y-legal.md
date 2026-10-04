# Seguridad y marco legal

## Seguridad

- Roles: visitante, usuario verificado, dueño, empleado, moderador, administrador. Hoy: rol global en `users.role` y dueño/empleado por restaurante, con Policies (ADR 0009); spatie/laravel-permission cuando lleguen moderadores y paneles.
- Autorización en el servidor para todo; prevenir IDOR (un dueño no puede editar otro restaurante cambiando un ID).
- Acceso sin contraseñas: código por WhatsApp (OTP) y passkeys; 2FA obligatorio para dueños y administradores.
- Límites de tasa en login, envío de códigos, reseñas y reportes. Hoy: el cambio de idioma (`PUT /locale`), 30 por minuto por IP.
- Validación de toda entrada, Eloquent (sin SQL crudo con datos del usuario), escape en vistas, CSRF, `$fillable`.
- Subida de imágenes: validar tipo y tamaño, re-procesar (elimina EXIF/GPS), nombre aleatorio, WebP. Regla para #18: se aceptan solo imágenes ráster (JPEG, PNG, WebP), que se convierten a WebP antes de guardarlas; nunca SVG, HTML ni el archivo tal como llegó. Lo que se sirve de `storage` lleva además una política que lo encierra en un sandbox (abajo).
- Historial de cambios de fichas con opción de revertir (activitylog).
- Secretos solo en `.env`; `composer audit` y Dependabot.
- HTTPS obligatorio, cabeceras de seguridad y política de contenido (abajo), base de datos sin exposición pública.
- NFC: validar CMAC del NTAG 424 DNA en el servidor y rechazar contadores repetidos.

### Seguridad HTTP (ADR 0014)

Implementado en #41. Lo comprueban las pruebas de Pest (`tests/Feature/Http`) y, sobre la imagen de producción con Octane, la prueba de humo (`tests/docker/smoke-prod.sh`).

- **TLS** termina en el proxy de delante (Caddy en el servidor o un túnel de Cloudflare); la app sirve HTTP solo en `127.0.0.1:8000`. Cómo se configura, en [Entrega y despliegue](despliegue.md#delante-de-la-app-tls-y-proxies-de-confianza).
- **Proxies de confianza:** la IP del cliente y el esquema (`X-Forwarded-For` y `X-Forwarded-Proto`) se aceptan solo de las IP o rangos de `TRUSTED_PROXIES`; sin valor, de nadie. Los límites de peticiones cuentan esa IP real. `X-Forwarded-Host` y `-Port` no se aceptan de nadie, y la app solo atiende el host de `APP_URL` (y `127.0.0.1` para la revisión de salud): con otro `Host`, 400.
- **Cookies:** sesión, token CSRF e idioma con `Secure` en producción (la imagen fija `SESSION_SECURE_COOKIE=true`) y `SameSite=Lax`; la sesión y el idioma, además, `HttpOnly`.
- **Cabeceras** en todas las respuestas de Laravel, también en errores: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (a `wa.me` y a Google Maps solo les llega el origen), `X-Frame-Options: DENY` (salvo con `CSP_FRAME_ANCESTORS`, solo en local) y `Permissions-Policy` con la ubicación solo para este origen y cámara, micrófono, pagos, USB y demás apagados. HSTS de un año con subdominios, solo en producción y por HTTPS. Sin `X-Powered-By`.
- **Política de seguridad de contenido (CSP)** con un nonce nuevo en cada petición: scripts y estilos solo de este origen o con el nonce, sin código en línea ni `eval`; el mapa solo desde su host (`connect-src` e `img-src`, a partir de `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`); el worker de MapLibre desde este origen; ningún iframe muestra la app (`frame-ancestors 'none'`); sin `<object>`, sin cambiar `<base>` ni mandar formularios a otro sitio. En desarrollo deja pasar además al servidor de Vite. `CSP_REPORT_ONLY=true` solo informa en la consola, para probar un cambio de la política (en producción la app lo avisa al arrancar); `CSP_REPORT_CANDIDATE=true` deja la vigente bloqueando y manda además una candidata que solo informa. Una ruta puede declarar otro perfil de la política (un panel), que parte de la pública y le suma lo que necesita: los paneles no relajan la política pública.
- **Archivos estáticos** (assets, fuentes, `storage`): los sirve Caddy sin pasar por Laravel, con `nosniff` y su caché. Lo de `storage` (lo que suben los dueños) lleva además `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox`: un archivo que no fuera una imagen se abre sin scripts y sin el origen de la app.
- **Páginas de error** (404, 419, 429, 500, 503) propias, en el idioma de la petición y con la política activa.

Un origen nuevo que la página necesite (otro host del mapa, un servicio externo desde el navegador) se agrega en `App\Support\ContentSecurityPolicy`, con su prueba: si no, el navegador lo bloquea.

## Marco legal (Colombia)

- **Ley 1581 de 2012 (Habeas Data):** política de tratamiento de datos, autorización explícita al registrarse, derechos de consulta, actualización y supresión. Datos mínimos (celular, alias). Direcciones solo en el dispositivo; ubicación: solo el resultado de la verificación.
- **Ley 1480 de 2011 (Estatuto del Consumidor):** publicidad veraz; lo pagado se marca "Patrocinado".
- **Derechos de autor:** solo información pública de los negocios; fotos y logos con autorización escrita; no copiar datos ni fotos de Google, TripAdvisor u otros.
- **OpenStreetMap (ODbL):** atribución visible en el mapa.
- **Reseñas:** prohibido condicionar premios a calificaciones altas; política de reseñas pública.
- **Propiedad intelectual:** software registrado ante la DNDA; marca ante la SIC (clases 9, 35, 42). El software no es patentable en Colombia (Decisión 486 de la CAN).

## Documentos pendientes

- Política de tratamiento de datos personales.
- Términos y condiciones.
- Política de reseñas.
- Formato de autorización de uso de información e imágenes para restaurantes.
