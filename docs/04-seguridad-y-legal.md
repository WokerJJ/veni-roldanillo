# Seguridad y marco legal

## Seguridad

- Roles: visitante, usuario verificado, dueño, empleado, moderador, administrador. Hoy: rol global en `users.role` y dueño/empleado por restaurante, con Policies (ADR 0009); spatie/laravel-permission cuando lleguen moderadores y paneles.
- Autorización en el servidor para todo; prevenir IDOR (un dueño no puede editar otro restaurante cambiando un ID).
- Panel de administración (`/admin`, ADR 0027): solo `users.role = admin`, autorización estricta y el rol exigido además en cada recurso. Aprobar, rechazar, publicar y ocultar son acciones de dominio que leen bloqueado y corren en una transacción. La contraseña temporal de un dueño nuevo se muestra una sola vez, en un modal que no la guarda en ningún lado, y el panel le exige cambiarla al primer ingreso. Aprobar un reclamo nunca vincula una cuenta que ya exista con ese correo, y el correo no se cambia desde el perfil (una cuenta por correo, sin distinguir mayúsculas). El tope de intentos del login es por cuenta e IP. Al guardar, los dos paneles comparan `updated_at` y no pisan un cambio hecho mientras el formulario estaba abierto.
- Acceso sin contraseñas: código por WhatsApp (OTP) y passkeys; 2FA obligatorio para dueños y administradores.
- Límites de tasa en login, envío de códigos, reseñas y reportes. Hoy: el cambio de idioma (`PUT /locale`), 30 por minuto por IP, y el login de los paneles del dueño y de administración, 5 intentos por minuto por IP y 10 fallidos por cuenta en 15 minutos, cada panel con su cuenta (ADR 0025 y 0027); los reclamos y pedidos de retiro de una ficha, 20 por hora por IP y 5 envíos válidos por día por celular, con un campo trampa en vez de CAPTCHA (ADR 0026).
- Búsqueda por plato (ADR 0029): la clave de Meilisearch (`MEILISEARCH_KEY`, la maestra) vive solo en el `.env` del servidor y Meilisearch no tiene puerto hacia internet; el navegador nunca le habla: pregunta a `GET /api/dishes/search`, que valida la consulta (3 a 60 caracteres con al menos tres letras o números, solo letras, números, espacios, apóstrofos, guiones y puntos), limita a 60 búsquedas por minuto por IP y responde una lista blanca confirmada en la base (nunca platos de fichas ocultas ni datos del dueño). La consulta no se guarda: si Meilisearch falla, el registro anota la clase del error, no lo que se buscó.
  - Mínimo privilegio en producción: la app no debería usar la clave maestra, sino una clave de API limitada al índice de platos (`dishes`, o `<SCOUT_PREFIX>dishes`) con solo lo que hace: `search`, `documents.add`, `documents.get`, `documents.delete`, `indexes.create`, `indexes.get`, `indexes.update`, `settings.get`, `settings.update` y `tasks.get`. Se crea una vez con la maestra (`POST /keys`, `"indexes": ["dishes"]`, `"expiresAt": null`) y la maestra queda solo para eso, fuera de la app. Así, una fuga de la clave de la app no da acceso a otros índices, a las claves ni a borrar Meilisearch entero. Pendiente: hoy `docker-compose.yml` arma `MEILI_MASTER_KEY` con la misma `MEILISEARCH_KEY` de la app, así que para aplicarlo hay que separar las dos variables (ver `.env.example`).
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
- **Política de seguridad de contenido (CSP)** con un nonce nuevo en cada petición: scripts y estilos solo de este origen o con el nonce, sin código en línea ni `eval`; el mapa solo desde su host (`connect-src` e `img-src`, a partir de `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`); el worker de MapLibre desde este origen; ningún iframe muestra la app (`frame-ancestors 'none'`); sin `<object>`, sin cambiar `<base>` ni mandar formularios a otro sitio. En desarrollo deja pasar además al servidor de Vite. `CSP_REPORT_ONLY=true` solo informa en la consola, para probar un cambio de la política (en producción la app lo avisa al arrancar); `CSP_REPORT_CANDIDATE=true` deja la vigente bloqueando y manda además una candidata que solo informa. Una ruta puede declarar otro perfil de la política (un panel), que parte de la pública y le suma lo que necesita: los paneles no relajan la política pública. El de los paneles del dueño y de administración (`/panel` y `/admin`, ADR 0025 y 0027) suma solo `'unsafe-eval'` en `script-src` (Alpine, dentro de Livewire) y `style-src-attr 'unsafe-inline'` (los atributos `style` de Filament); scripts y `<style>` siguen con el nonce.
- **Archivos estáticos** (assets, fuentes, `storage`): los sirve Caddy sin pasar por Laravel, con `nosniff` y su caché. Lo de `storage` (lo que suben los dueños) lleva además `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox`: un archivo que no fuera una imagen se abre sin scripts y sin el origen de la app.
- **Páginas de error** (404, 419, 429, 500, 503) propias, en el idioma de la petición y con la política activa.

Un origen nuevo que la página necesite (otro host del mapa, un servicio externo desde el navegador) se agrega en `App\Support\ContentSecurityPolicy`, con su prueba: si no, el navegador lo bloquea.

## Marco legal (Colombia)

- **Ley 1581 de 2012 (Habeas Data):** política de tratamiento de datos, autorización explícita al registrarse, derechos de consulta, actualización y supresión. Datos mínimos (celular, alias). Direcciones solo en el dispositivo; ubicación: solo el resultado de la verificación.
- **Reclamos y retiros de fichas (ADR 0026):** nombre, celular, correo opcional y lo que pide cada formulario, con la autorización expresa, su fecha (`privacy_accepted_at`) y la versión del aviso aceptada (`privacy_notice_version`); no se publican ni se mandan a terceros; a los seis meses de resueltos, los rechazados se borran y los aprobados se anonimizan (`model:prune` diario). El formulario trae un resumen del tratamiento con el responsable y el correo de contacto (`VENI_PRIVACY_CONTACT_EMAIL`) y enlaza la política completa (`/privacy`); la versión aceptada es la de la política (`LegalDocument::PRIVACY_VERSION`). Las solicitudes enviadas antes de #23 guardan `2026-10-26`, el resumen provisional, que dice lo mismo sobre esos datos (ADR 0030).
- **Ley 1480 de 2011 (Estatuto del Consumidor):** publicidad veraz; lo pagado se marca "Patrocinado".
- **Derechos de autor:** solo información pública de los negocios; fotos y logos con autorización escrita; no copiar datos ni fotos de Google, TripAdvisor u otros. Única excepción: OpenStreetMap (ADR 0021).
- **OpenStreetMap (ODbL):** atribución visible en el mapa y en la página de créditos (`/credits`). De OpenStreetMap se importan solo nombre, tipo y punto de los locales de comida, como fichas ocultas hasta verificarlas en la calle y con su procedencia guardada; nunca teléfonos, correos, sitios web ni redes. La parte de la base que viene de allí queda bajo ODbL y se entrega a quien la pida.
- **Reseñas:** prohibido condicionar premios a calificaciones altas; política de reseñas pública.
- **Propiedad intelectual:** software registrado ante la DNDA; marca ante la SIC (clases 9, 35, 42). El software no es patentable en Colombia (Decisión 486 de la CAN).

## Documentos legales (#23, ADR 0030)

Públicos, en español y en inglés, enlazados en el pie, en la bienvenida del inicio y en los créditos:

| Documento | Ruta | Versión |
| --- | --- | --- |
| Tratamiento de datos personales | `/privacy` | `LegalDocument::PRIVACY_VERSION` |
| Términos de uso | `/terms` | `LegalDocument::TERMS_VERSION` |
| Política de reseñas (la que regirá cuando existan) | `/reviews-policy` | `LegalDocument::REVIEWS_VERSION` |

- **Dónde vive el texto:** `lang/es/documents.php` (referencia) y `lang/en/documents.php`, con las mismas claves y marcadores (lo prueba `tests/Feature/LegalPagesTest.php`). No van en `lang/{es,en}.json`, que viaja entero al navegador: el texto llega como prop solo a su página. `:controller` y `:email` los pone el controlador desde `RestaurantContactRequest::PRIVACY_CONTROLLER` y `config/privacy.php`.
- **Cómo se versionan:** cada documento tiene su versión y su fecha en `App\Enums\LegalDocument`, visibles arriba de la página. Cambiar lo que dice un documento exige subir las dos en el mismo commit; lo que dijo cada versión queda en git. Los borradores van en `0.x`; la versión revisada por un abogado será `1.0`.
- **El aviso de los formularios** (reclamo y retiro) es un resumen de la política y acepta su versión: `privacy_notice_version` guarda `LegalDocument::PRIVACY_VERSION`. Si una versión nueva cambiara para qué se usan datos ya recogidos, hay que pedir una autorización nueva (la política lo dice).
- **Borrador:** mientras no los revise un abogado, cada página dice «Borrador pendiente de revisión jurídica» (no es asesoría legal). Se apaga con `VENI_LEGAL_DRAFT_NOTICE=false` (`config/legal.php`), junto con la subida de versión.
- **Pendiente para el despliegue:** el correo real del responsable, su domicilio y teléfono (el Decreto 1377 los pide en la política), el proveedor de alojamiento nombrado como encargado y la revisión jurídica de los tres textos.

## Documentos pendientes

- Formato de autorización de uso de información e imágenes para restaurantes.
