# ADR 0049 · Dominio de pruebas que no se indexa y primer administrador por consola

- Estado: aceptada
- Fecha: 2026-11-20
- Precisa: ADR 0014 (seguridad HTTP detrás del proxy) y ADR 0027 (panel de administración)
- Afecta a: `config/app.php` (`robots_noindex`), `app/Http/Middleware/SetSecurityHeaders.php`, `app/Http/Middleware/PrivateResponse.php`, `public/robots.txt`, `app/Actions/Users/CreateAdminAccount.php`, `app/Console/Commands/MakeAdmin.php`

## Contexto

Antes del servidor definitivo, la imagen corre en el computador del equipo, detrás de un túnel de Cloudflare, en `veniroldanillo.co.uk` (`docs/salida-de-pruebas.md`). Eso pide dos cosas que el código no tenía: que ese dominio no compita en los buscadores con el `.co` de mañana, y una forma de crear la primera cuenta de administración en producción, donde `PanelAdminSeeder` no corre y el panel no crea administradores.

## Decisiones

1. **`ROBOTS_NOINDEX` (apagada por defecto)** pone `X-Robots-Tag: noindex, nofollow, noarchive` en todas las respuestas, también las de error (en `SetSecurityHeaders`, que envuelve a todo). `PrivateResponse` comparte la constante y no la duplica.
2. **`/robots.txt` no cambia y sigue dejando rastrear.** Con `Disallow: /` un buscador no descarga la página, nunca lee el `noindex` y puede listar la URL si alguien la enlaza: las dos medidas se anulan. Como no varía con el entorno, sigue siendo el archivo estático de `public/` y no una ruta.
3. **Un valor que no es booleano detiene la carga de la configuración.** Un error de escritura («ture») leído como `false` dejaría el dominio de pruebas indexable sin que nadie se enterara; es mejor que el despliegue falle a la vista.
4. **`php artisan veni:make-admin <correo>`** crea la cuenta con una acción de dominio (`CreateAdminAccount`) y la consola solo pregunta. La contraseña se pide por un campo secreto, dos veces, nunca como argumento (quedaría en el historial del shell), y queda temporal. Rechaza un correo con cuenta, sin vincularla en silencio (ADR 0027), y los datos se validan antes de pedir la confirmación de producción.

## Alternativas descartadas

- **`Disallow: /` además de la cabecera:** parece más estricto, pero anula la cabecera para los buscadores obedientes (decisión 2).
- **Leer la contraseña por la entrada estándar (`--password-from-stdin`):** no hace falta hoy; se agrega si un despliegue automatizado lo pide.
- **Un seeder o un registro público para el primer administrador:** el primero deja credenciales conocidas en producción; el segundo, una puerta abierta.

## Consecuencias

- El dominio de pruebas se apaga de los buscadores con una sola variable, y en el `.co` definitivo se deja en `false`.
- Un `ROBOTS_NOINDEX` mal escrito impide arrancar (también `config:cache`): se corrige el `.env`.
- La cabecera es un pedido, no una barrera: no sustituye a Cloudflare Access delante de `/admin*` y `/campo*`.
