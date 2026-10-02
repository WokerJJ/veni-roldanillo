# ADR 0011 · Íconos: colombia-icons copiados desde una versión fija

- Estado: aceptada
- Fecha: 2026-10-01
- Afecta a: `README.md` (atribución de los íconos).

## Contexto

La interfaz necesita íconos (tema, idioma, buscar, mapa, carrito, horario) y el producto tiene categorías de comida y una guía de platos típicos (#21) que piden algo más que un set genérico: una empanada, un sancocho, una taza de tinto. Hasta ahora había dos SVG escritos a mano dentro del botón de tema.

[colombia-icons](https://github.com/Mteheran/colombia-icons) (MIT, de Miguel Teheran) es un set hecho por colombianos: íconos de trazo de 24×24 con `stroke="currentColor"`, que heredan los colores de la marca, con una parte genérica de interfaz y otra de gastronomía, cultura, mapas y naturaleza de Colombia. Publica paquetes para React (`@mteherandev/colombia-icons-react`), Angular y Blazor. No tiene paquete para Vue.

## Alternativas

- **Depender de un paquete de npm.** No hay paquete de Vue ni uno solo con los SVG; los que existen entregan componentes de React o de Angular. Envolverlos traería ese framework al bundle.
- **Lucide o Heroicons.** Tienen paquete oficial para Vue y cargan solo lo que se importa, pero no tienen íconos de comida colombiana: habría que dibujarlos o mezclar dos sets con trazos distintos. El motivo para elegir colombia-icons es justo esa parte.
- **Un sprite (`<symbol>` + `<use>`).** Una sola petición que el navegador guarda en caché, pero trae todo el set aunque la página use un ícono y necesita un paso de compilación que lo arme. Con 40 íconos pequeños no compensa; se puede revisar si el set crece mucho.
- **Copiar los SVG al repositorio** (la elegida).

## Decisión

### Copia desde una versión fija, con manifiesto

- Los SVG viven en `resources/icons/colombia/`, tal como salen del repositorio de origen (sin optimizar ni editar), junto a su `LICENSE` y un `README.md` de procedencia. Solo se copian los que se usan y un conjunto inicial para lo que viene: 26 de interfaz y los 14 de gastronomía (16,3 kB en total), no los 291 del set.
- `manifest.json` fija la versión: repositorio, tag (`v0.27.0`), el commit al que apuntaba el tag al copiar y, por cada ícono, su ruta de origen y el sha256 del archivo. Un tag se puede mover; un commit no: la descarga se hace contra el commit.
- `npm run icons:sync` (`scripts/icons-sync.mjs`, sin dependencias) descarga **solo** los íconos del manifiesto y la licencia. Falla, sin escribir nada, si un ícono no existe en ese tag, si el tag ya no apunta al commit registrado o si un archivo no tiene el sha256 esperado; `--update` acepta esos cambios cuando se cambia el tag a propósito e informa qué cambió (el commit anterior y el nuevo, los archivos distintos, los nuevos y los quitados). También borra de la carpeta los SVG que el manifiesto ya no menciona. Mira la carpeta antes de escribir y no sigue redirecciones: lo que copia sale de la dirección del manifiesto o de ninguna.
- `npm run icons:check` no usa la red ni escribe: compara los archivos versionados con el manifiesto (sha256, que no falte ni sobre ninguno) y valida cada SVG. Corre dentro de `npm test`, así que CI falla si alguien edita un ícono a mano o agrega uno sin pasarlo por el manifiesto. Prueba coherencia, no procedencia: quien cambia un archivo puede cambiar también su sha256 en el manifiesto.
- `npm run icons:verify` prueba la procedencia: descarga otra vez la licencia y cada ícono desde el commit fijado y los compara con los versionados, sin escribir. Falla si alguno difiere aunque su sha256 coincida con el manifiesto. Necesita la red, así que no corre en cada PR: corre cada semana en `security.yml` (informativo) y a mano al revisar un PR que toque los íconos.

### Componente `Icon`

- `<Icon name="sol" />`. El tipo de `name` son las claves de `icons` del manifiesto (un `import type`: el JSON no entra al bundle), así que un nombre que no existe no compila y agregar un ícono al manifiesto lo agrega al tipo. No hay un archivo de tipos generado que mantener.
- Hereda el color (`currentColor`); el tamaño va en píxeles con `size` (24 por defecto) o con clases (`class="size-5"`). Es decorativo por defecto (`aria-hidden="true"`, `focusable="false"`); con `label` pasa a ser una imagen con nombre (`role="img"` y `aria-label`); una etiqueta en blanco cuenta como no tenerla.
- Los atributos de la raíz (`fill`, `stroke`, `stroke-width`…) se leen de cada archivo, porque no todos son iguales: `estrella-llena` es de relleno, no de trazo.

### Qué entra al bundle inicial

Se compararon tres formas de cargar los SVG (`app.js`, minificado y con gzip; antes de este cambio: 181,25 kB · 62,21 kB):

| Forma | `app.js` | gzip | Comentario |
| --- | --- | --- | --- |
| Todo el set en el bundle (`import.meta.glob` con `eager`) | 199,14 kB | 66,61 kB | Crece con cada ícono que se agrega |
| Importación estática por ícono en cada componente | — | — | Lo más liviano, pero el componente recibiría el SVG en vez de un nombre: se pierde `name` y no sirve cuando el ícono sale de un dato (la categoría de un plato) |
| **Críticos en el bundle, el resto un chunk por ícono** | 186,25 kB | 63,58 kB | La elegida |

Los íconos del layout (`sol`, `luna`, `idioma`) van en el bundle inicial: están en todas las páginas y, si llegaran después, el encabezado parpadearía. El resto se pide con una importación dinámica la primera vez que una página lo pinta (0,2 a 0,65 kB con gzip cada uno) y queda en memoria. Mientras llega, el `<svg>` está vacío pero con su tamaño, así que no mueve lo que tiene alrededor. El costo fijo son 1,37 kB con gzip en `app.js`: los tres íconos críticos, el componente y la tabla que dice en qué chunk está cada ícono.

### Por qué `v-html` es seguro aquí

El componente inserta el dibujo con `v-html`, que el linter prohíbe en el resto del proyecto (la excepción está en `eslint.config.js`, solo para `Icon.vue`). Es seguro porque lo que se inserta nunca es un dato:

1. Es un archivo del repositorio, que pasa por revisión como cualquier otro código. `name` solo elige entre esos archivos.
2. Viene de un commit fijo. El sha256 del manifiesto dice que el archivo y el manifiesto coinciden (un cambio que no pase por el manifiesto hace fallar las pruebas), no de dónde salió el archivo: que sea idéntico al del origen lo comprueba `npm run icons:verify`.
3. El script valida cada SVG contra una lista blanca, al descargarlo y en cada `--check`: solo elementos de dibujo (`path`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `rect`, `g`) y sus atributos de geometría y trazo. Rechaza `<script>`, `<style>`, `<foreignObject>`, `<use>`, atributos de evento (`on…=`), enlaces (`href`), estilos en línea, referencias `url()` y comentarios.

La alternativa era interpretar el SVG en el navegador y construir los nodos uno por uno: más código en el bundle inicial para llegar al mismo resultado con archivos que ya están validados.

### Licencia y atribución

La licencia MIT pide conservar el aviso de copyright: el `LICENSE` original se copia junto a los íconos (también con sha256 en el manifiesto) y el README del proyecto los atribuye. La clave `credits.icons` queda en `lang/es.json` y `lang/en.json` para la página «Acerca de» o legal cuando exista.

## Consecuencias

- Sin dependencias nuevas. La actualización es manual y deliberada: cambiar el tag en el manifiesto, `npm run icons:sync -- --update` (informa qué cambió) y revisar el diff de los SVG en el PR. Si el commit cambia sin haber cambiado el tag, el tag se movió en el origen: no se acepta sin revisar allá qué cambió. Dependabot no avisa de versiones nuevas del set.
- Agregar un ícono es una entrada en el manifiesto (nombre y ruta de origen) y `npm run icons:sync`, que completa el sha256. No se copian SVG a mano.
- Los archivos no se editan: si un ícono necesita un ajuste, se propone en el repositorio de origen. El grosor del trazo (1,5) es el del set.
- Un ícono bajo demanda es una petición más la primera vez. Si uno queda a la vista al cargar una página, se pasa a la lista de críticos de `resources/js/icons/icons.ts`, que está escrita dos veces (los patrones de `import.meta.glob` tienen que ser literales). La caché de la PWA (#5) debe incluir los chunks de los íconos para que funcionen sin conexión.
- Sin red, un ícono que no se había pedido queda vacío: conserva su espacio y su nombre accesible, pero no se ve; se vuelve a pedir cuando vuelve la red (evento `online`). Por eso un ícono nunca debe ser lo único que identifica un control: los botones llevan su propio nombre.
- Si colombia-icons publica un paquete para Vue o uno con los SVG, se revisa esta decisión.
