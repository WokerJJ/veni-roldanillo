# ADR 0030 · Documentos legales: texto en archivos de idioma del servidor, versión en el código y aviso de borrador por config

- Estado: aceptada
- Fecha: 2026-10-29
- Precisa: ADR 0010 (una sola fuente de textos, `lang/{es,en}.json`, que viaja entera al navegador), ADR 0025 (textos solo del servidor en `lang/{es,en}/panel.php`) y ADR 0026 (el aviso de privacidad de los formularios y `privacy_notice_version`).
- Afecta a: `app/Enums/LegalDocument.php`, `app/Http/Controllers/LegalDocumentController.php`, `config/legal.php`, `lang/{es,en}/documents.php`, `routes/web.php`, `resources/js/pages/Legal.vue`, `app/Http/Requests/RestaurantContactRequest.php`, `app/Http/Controllers/RestaurantRequestController.php`, `resources/js/components/requests/RequestFormPage.vue`, `resources/js/layouts/AppLayout.vue`, `resources/js/pages/{Home,Credits}.vue`.

## Contexto

#23 pide tres documentos públicos en español e inglés: la política de tratamiento de datos personales (Ley 1581 de 2012 y Decreto 1377 de 2013), los términos de uso y la política de reseñas. Son textos largos (unos 25 kB por idioma), que cambian poco pero cuyo cambio importa: la política de datos es lo que acepta quien envía un reclamo o un retiro (ADR 0026), y hay que poder decir qué versión aceptó cada uno. Todavía no los revisó un abogado.

Había que decidir dónde vive el texto, cómo se versiona, cómo llega a la página sin pesar en el resto de la app y cómo se dice, con honestidad, que es un borrador.

## Alternativas

- **En `lang/{es,en}.json`, como el resto de la interfaz.** Sería lo más simple, pero ese archivo viaja entero al navegador en la primera visita de cualquier página (prop `translations`, ADR 0010): todos los visitantes descargarían unos 25 kB más de texto que casi nadie lee. Se descarta.
- **Markdown versionado (`resources/legal/privacy.es.md`) convertido a HTML.** Se escribe cómodo y el diff se lee bien, pero el HTML llegaría a la página con `v-html` (contenido sin escapar, aunque sea nuestro), la tabla de contenido y las anclas habría que sacarlas del HTML, y la prueba de paridad entre idiomas compararía texto suelto. Se descarta por ahora.
- **Páginas Vue con el texto escrito en la plantilla.** Mezcla contenido legal con código y deja el texto en el bundle de la página. Se descarta.
- **Archivos de idioma del servidor (`lang/{es,en}/documents.php`) con una estructura fija**, como `panel.php` (ADR 0025): cada documento con título, descripción, introducción y secciones; cada sección con su clave (que es el ancla) y una lista de bloques (un texto es un párrafo; una lista de textos, viñetas). El controlador los manda como prop solo a su página. Se elige esta.

Para la versión: en `.env` se podría cambiar sin tocar el texto, y en la base pediría una tabla y un panel que hoy no hacen falta. Se elige **una constante por documento en el código**, al lado del texto que versiona.

## Decisión

1. **Rutas.** `GET /privacy`, `/terms` y `/reviews-policy` (en inglés, como el resto), públicas, con el grupo web, nombres `legal.privacy`, `legal.terms` y `legal.reviews`. Las tres van a `LegalDocumentController`, que recibe el documento por el `defaults()` de la ruta, convertido al enum `App\Enums\LegalDocument`.
2. **Texto.** En `lang/{es,en}/documents.php`, con las mismas claves en los dos idiomas (lo prueba `tests/Feature/LegalPagesTest.php`, con los mismos marcadores). El español es el texto de referencia. El controlador reemplaza `:controller` (el responsable, `RestaurantContactRequest::PRIVACY_CONTROLLER`) y `:email` (`config('privacy.contact_email')`, ficticio en el repositorio), y manda `document` (título, introducción, versión, fecha, fecha escrita en el idioma de la petición y secciones), `draft`, `contactEmail`, `related` (los otros dos documentos) y `meta` (título y descripción para el HTML de la primera carga, como la ficha del restaurante). `lang/{es,en}.json` lleva solo los textos cortos de la página (`legal.*`: versión, borrador, índice, enlaces).
3. **Versión.** `LegalDocument::PRIVACY_VERSION`, `TERMS_VERSION` y `REVIEWS_VERSION`, más `effectiveDate()`. Cambiar lo que dice un documento exige subir su versión y su fecha en el mismo commit. Los borradores sin revisión jurídica van en `0.x`; la versión revisada será `1.0`.
4. **El aviso de los formularios es la política.** `RestaurantContactRequest::PRIVACY_NOTICE_VERSION` pasa a ser `LegalDocument::PRIVACY_VERSION`: cada solicitud nueva guarda en `privacy_notice_version` la versión de la política publicada en `/privacy`. El resumen plegable de los formularios se queda (es lo que se lee antes de marcar la casilla) y enlaza la política completa, en otra pestaña para no perder lo escrito. Las solicitudes anteriores guardan `2026-10-26`, el resumen provisional del ADR 0026; esa versión del texto queda en el historial de git (`lang/es.json`, `requests.privacy_*`). No hace falta pedirles una autorización nueva: la política no suma finalidades para esos datos (revisar la solicitud, contactar, borrar o anonimizar a los seis meses). Si una versión futura cambiara para qué se usan, sí (y la política lo dice).
5. **Borrador.** `config('legal.draft_notice')` (`VENI_LEGAL_DRAFT_NOTICE`, por defecto `true`) muestra arriba de cada documento «Borrador pendiente de revisión jurídica», con `role="note"`: no es asesoría legal y puede cambiar. Se apaga cuando un abogado revise los textos, junto con la subida de versión.
6. **Página.** `Legal.vue`, un chunk aparte (como toda página): `h1` con el título, versión y fecha visibles, el aviso de borrador, la introducción, una tabla de contenido (`nav` con `ol` de anclas, `#privacy-rights`), una `section` con su `h2` por sección, el correo de contacto como enlace y los otros documentos y los créditos. Áreas táctiles de 44 px, ancho de lectura acotado.
7. **Enlaces.** En el pie de todas las páginas con pie (una `nav` con nombre, «Documentos legales»), en la bienvenida del inicio (que no tiene pie: créditos, datos personales y términos) y en los créditos (los tres).

## Consecuencias

- El arranque no carga el texto: el inicio solo suma tres enlaces y diez textos cortos en `lang/{es,en}.json`. El presupuesto de `resources/js/map/bundle.test.ts` no se toca.
- Cambiar una coma de un documento es un cambio de código, revisado en un PR, con su versión. Lo que dijo cada versión queda en git. Si un día lo edita alguien sin acceso al repositorio, se pasa a la base con su ADR.
- Los textos tienen la misma estructura en los dos idiomas: una traducción no puede agregar o quitar un párrafo sin que falle la prueba. Es a propósito.
- Cuando lleguen las reseñas y las cuentas para calificar, la política de datos tiene que cambiar (y subir de versión) antes de pedir datos nuevos; la política de reseñas se escribió como la que regirá y lo dice.
- Pendiente para el despliegue: el correo real del responsable (`VENI_PRIVACY_CONTACT_EMAIL`), el proveedor de alojamiento nombrado en la política y la revisión jurídica de los tres textos.
