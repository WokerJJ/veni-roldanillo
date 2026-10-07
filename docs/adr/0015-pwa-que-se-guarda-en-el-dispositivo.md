# ADR 0015 · PWA: qué se guarda en el dispositivo

- Estado: aceptada
- Fecha: 2026-10-07
- Precisa: ADR 0002 (la app es una PWA), ADR 0007 (el mapa llega de veni-mapa, hoy sin versión en la URL), ADR 0010 (el idioma lo resuelve el servidor; la caché de la PWA debía tenerlo en cuenta) y ADR 0014 (CSP con nonce y `worker-src 'self'`).
- Afecta a: `docs/03-arquitectura.md` («App instalable y caché»), que lleva el detalle de cada caché y sus límites.

## Contexto

La regla 8 de producto pide que la app sirva con datos móviles y mala señal. Un service worker lo resuelve guardando cosas en el teléfono, y cada cosa guardada es una copia que puede quedar vieja o ser de otra persona. Al hacer la app instalable (#5) hubo que decidir qué se guarda, qué no, y qué pasa cuando sale una versión nueva.

Lo que condiciona la decisión:

- El HTML no es igual para todos: depende de la cookie del idioma (ADR 0010), de la sesión y del token CSRF.
- La gente arma pedidos en la página. Una recarga a destiempo los pierde.
- El mapa del inicio pesa unos 310 kB comprimidos de motor, más un PMTiles que se pide por rangos.
- La URL del mapa hoy no lleva versión (ADR 0007): la misma dirección trae otra cosa después de cada release de veni-mapa.
- Las fuentes de `public/fonts` no llevan hash en el nombre (#2).
- El navegador pide el manifest sin cookies, y sin red no hay servidor a quién preguntarle el idioma.

## Alternativas

- **Guardar el HTML** (network first o stale-while-revalidate para las navegaciones). Abriría la app sin red con la última página vista. Descartada: serviría una página en otro idioma, con la sesión de antes o con un token CSRF vencido, y en un teléfono compartido, la de otra persona.
- **Actualizar sola (`registerType: 'autoUpdate'`).** La versión nueva se activa y recarga todas las pestañas sin preguntar. Descartada: recarga en medio de un pedido.
- **Service worker propio (injectManifest).** Da control total, a cambio de un archivo más que mantener, compilar y probar aparte. Descartada mientras lo que haga falta quepa en la configuración de generateSW.
- **Todo el mapa en el precache.** El precache se baja entero o el service worker no se instala: con mala señal, más peso es más instalaciones fallidas, y cada despliegue que toque el motor lo volvería a bajar a todos. Descartada.
- **Guardar el PMTiles.** La Cache API no guarda respuestas parciales (206) y la biblioteca nunca pide el archivo entero. Descartada; el detalle está en `docs/03-arquitectura.md`.
- **Fuentes como inmutables (cache first).** Sin hash en el nombre, una fuente corregida no llegaría nunca a quien ya la tiene. Descartada hasta que lleven hash (#2).
- **Un manifest por idioma.** El navegador lo pide sin la cookie del idioma y lo guarda al instalar: no hay con qué elegir. Descartada.
- **Esperar la red sin límite.** Con señal mala, una navegación puede quedarse un minuto en blanco antes de fallar. Descartada.

## Decisión

- **El HTML no se guarda nunca.** Las navegaciones van siempre a la red. Si la red falla, o no responde en el plazo de abajo, sale una página sin conexión propia (`/offline`), que sí está en el precache porque es igual para todos: no depende de la sesión ni del idioma de la petición.
- **Plazo de 10 segundos para una navegación.** Pasado ese tiempo sin respuesta sale la página sin conexión, con «Reintentar». Por eso su título no afirma que no hay red: «Sin señal o muy lenta».
- **Las versiones nuevas avisan, no se imponen** (`registerType: 'prompt'`). La versión nueva queda esperando y la app muestra «Hay una versión nueva de Vení · Actualizar», con «Ahora no». Solo se recarga la pestaña donde se aceptó; las demás siguen con su aviso. Si nadie acepta, se activa al cerrar todas las pestañas.
- **generateSW.** Workbox arma el service worker desde la lista de rutas de `resources/js/pwa/runtimeCaching.ts`. La única pieza escrita a mano es la función que atiende las navegaciones: generateSW solo acepta un plazo de red con la estrategia que guarda lo que responde (network first), justo lo que aquí no se quiere.
- **El mapa queda fuera del precache y el PMTiles no se guarda.** El motor (MapLibre) se guarda la primera vez que se pide, en una caché propia con lugar para dos versiones. De los archivos del host del mapa se guardan estilos, glyphs y sprites: si la URL lleva la versión (`/v0.2.0/`), se usa lo guardado; si no la lleva, el estilo y la lista del sprite se piden primero a la red (lo guardado sale sin red o a los 3 segundos) y los glyphs e imágenes se muestran guardados y se renuevan detrás. El PMTiles y el grafo de rutas no pasan por el service worker.
- **Las fuentes, mientras no lleven hash, se revalidan** (stale-while-revalidate): se usa la guardada y se pide la nueva detrás.
- **El manifest va en español**, el idioma por defecto. **La página sin conexión trae los dos idiomas** y elige en el teléfono: el último con que respondió el servidor ahí (queda en `localStorage`) y, si nunca abrió la app con red, el primero del teléfono que la app tenga.
- **Toda caché tiene tope** (entradas, y días donde aplica), guarda solo respuestas 200 y se vacía primero si el teléfono se queda sin espacio.

## Consecuencias

- Sin red, la app no muestra restaurantes ni menús: muestra la página sin conexión. Verlos sin señal es otra decisión (guardar datos, no HTML) y llegará con las fichas.
- Una página que tarde más de 10 segundos en responder se ve como «sin señal», aunque el servidor siga trabajando: ninguna navegación debe depender de un proceso largo. El plazo no toca los envíos de formularios ni las visitas de Inertia, que no son navegaciones `GET` del navegador.
- Las pruebas de `runtimeCaching.ts` fijan lo decidido: ninguna ruta con caché recibe una navegación ni `PUT /locale`, toda caché tiene tope y solo guarda 200. La función de las navegaciones se prueba como queda en `public/sw.js`, copiada como texto: no puede usar nada de fuera de ella.
- Cambiar el nombre de una caché deja la anterior en los teléfonos hasta que venza o se borre a propósito: los nombres se tratan como parte del contrato.
- La versión de la página sin conexión en el precache sale de todo lo que la arma (la vista, los textos, los colores de la marca, el nombre de la app y sus idiomas): si cambia algo de eso, el service worker la vuelve a pedir.
- Quien no acepta «Actualizar» sigue con la versión anterior de la interfaz hasta cerrar la app. Si el despliegue cambió los assets, Inertia recarga la página al ver otra versión del manifest de Vite.
- Mientras la URL del mapa no lleve versión, la primera carga del mapa con señal lenta espera hasta 3 segundos el estilo antes de usar el guardado. Con una URL versionada, el mapa abre de lo guardado sin tocar la red.
- En desarrollo no hay service worker, y la app quita el que hubiera dejado un build de producción en la misma dirección.
- Cuando las fuentes lleven hash (#2) pasan a guardarse como el resto de los assets; cuando haga falta el mapa sin conexión, la forma es una descarga explícita de una release fija, con su tamaño a la vista.
