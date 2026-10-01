# ADR 0010 · Idioma de la interfaz

- Estado: aceptada
- Fecha: 2026-10-01
- Afecta a: `CONTRIBUTING.md` (archivos de idioma).

## Contexto

La app es para residentes (español) y turistas (inglés): "idioma según el teléfono, cambiable" (`docs/02-producto.md`). Había que decidir quién resuelve el idioma, dónde viven los textos para que Laravel y Vue no tengan dos copias, cómo se recuerda la elección y cómo se muestran los campos de contenido que tienen versión `_es` y `_en` (ADR 0009).

## Decisión

### Quién decide el idioma: el servidor

El middleware `SetLocale` (grupo `web`, antes del de Inertia) resuelve el idioma en cada petición, en este orden:

1. Parámetro `?lang=es|en`: lo usa y lo fija en la cookie (sirve para compartir un enlace en inglés).
2. Cookie `locale` (la elección guardada en el dispositivo).
3. `users.locale`, si hay sesión.
4. Cabecera `Accept-Language` (el idioma del teléfono), respetando el orden de preferencia y descartando `q=0`.
5. Español por defecto.

Así el HTML llega en el idioma correcto, sin destello de textos en el otro idioma, y `<html lang>` es correcto desde el servidor. La respuesta lleva `Content-Language` y `Vary: Accept-Language, Cookie`. Un valor inválido en cualquier fuente se ignora y se pasa a la siguiente.

- **Cookie:** `locale`, un año, `SameSite=Lax`, `HttpOnly`, `Secure` según la configuración de la sesión. Solo guarda `es` o `en`: es una preferencia de la interfaz, no un dato personal. Va sin cifrar (excluida de `EncryptCookies`) porque no es secreta y el servidor la valida contra la lista de idiomas al leerla.
- **`?lang` no cambia la cuenta:** un enlace (GET) no modifica datos guardados; solo la cookie. El cambio explícito con el selector sí actualiza `users.locale`.
- **Selector:** `PUT /locale` valida el idioma, guarda la cookie (y `users.locale` si hay sesión) y redirige a la página anterior sin el parámetro `lang` (si no, el parámetro volvería a imponer el idioma anterior). Solo redirige dentro del mismo sitio.

### Rutas sin prefijo de idioma (por ahora)

La misma URL sirve los dos idiomas. Es lo más simple para una PWA con un solo dominio, pero los buscadores rastrean sin cookie y con `Accept-Language` variable, así que indexan casi siempre la versión en español. Si el tráfico de turistas desde buscadores llega a importar, la evolución es un prefijo `/en` con `<link rel="alternate" hreflang>` en las dos versiones; `?lang=en` ya permite enlazar la versión en inglés mientras tanto.

### Una sola fuente de textos: JSON de Laravel

- `lang/es.json` y `lang/en.json`, los mismos que lee `__()` en PHP. El español es el texto de origen; el inglés, su traducción para turistas.
- **Claves con puntos** (`layout.skip_to_content`, `home.title`) y no el texto en español como clave: el texto se puede corregir (voz de marca) sin tocar el código ni romper la traducción, una misma palabra puede tener dos traducciones según el contexto ("Inicio" del menú no es "Inicio" de un proceso), y una clave que falta se nota a simple vista porque se muestra la clave. Los prefijos no repiten los grupos de Laravel (`validation`, `auth`, `pagination`, `passwords`), porque una clave JSON con ese nombre los reemplazaría.
- **Compartidas con Vue por Inertia:** el middleware de Inertia comparte `locale` y todas las traducciones del idioma actual. Hoy son 11 claves (menos de 1 KB por idioma); se envían como prop `once` con la clave `translations:<idioma>`: el cliente las recuerda entre visitas y el servidor las vuelve a mandar solo cuando cambia el idioma. Si el archivo crece al punto de pesar en la primera carga (del orden de 20 KB), se separan por página: comunes compartidas y las de cada página en sus props.
- **Frontend propio y mínimo:** `useI18n()` devuelve `locale`, `t()` y `setLocale()`. `t()` está tipada con las claves de `lang/es.json` (un `import type`, que no entra al bundle), reemplaza `:marcador` igual que Laravel (también `:Marcador` y `:MARCADOR`) y, si una clave falta, devuelve la clave. El mismo composable mantiene `document.documentElement.lang` al día cuando el idioma cambia sin recargar (selector o historial).
- **Por qué no `laravel-vue-i18n`:** resuelve lo mismo y suma pluralización, pero los textos salen del bundle: o cada idioma es un chunk que se pide después de arrancar Vue (una petición más en la primera carga o un destello de claves) o van todos los idiomas en el bundle inicial; necesita su plugin de Vite y la carpeta `lang` dentro de la etapa de compilación de la imagen, y trae `php-parser` como dependencia. Con el idioma resuelto en el servidor y los textos dentro de la respuesta de Inertia, la solución propia es un composable pequeño, con pruebas y sin dependencias nuevas. Si llegan plurales o formatos complejos, se revisa esta decisión.

### Campos de contenido traducibles

El trait `HasTranslatableFields` da `translated('name')`: devuelve `name_en` o `name_es` según el idioma actual y, si falta el inglés (nulo o vacío), el español. Cada modelo declara sus campos; pedir uno que no está declarado lanza una excepción en vez de devolver nulo en silencio. Los barrios no lo usan: su nombre es propio y no se traduce.

### Calidad

- Una prueba falla si `lang/es.json` y `lang/en.json` no tienen exactamente las mismas claves y los mismos marcadores, y otra si el código usa con `__()`, `@lang()` o `t()` una clave que no existe.
- `fallback_locale` de Laravel sigue en `en` para los mensajes del framework (validación) mientras no haya traducción al español de esos archivos; las claves propias no dependen del respaldo porque la prueba de paridad obliga a tenerlas en los dos idiomas.

## Consecuencias

- Sin dependencias nuevas en PHP ni en npm.
- Todo texto visible nuevo necesita su clave en los dos archivos; CI lo exige.
- El HTML depende de la cookie y de `Accept-Language`: la caché de la PWA (#5) no debe servir el HTML de una URL sin tener en cuenta el idioma.
- Al crear cuentas (fase de reseñas), `users.locale` debe iniciar con el idioma resuelto en ese momento; si no, el valor por defecto (`es`) le ganaría al idioma del teléfono.
- Los mensajes de validación en español (`lang/es/validation.php`) llegan con el primer formulario.
