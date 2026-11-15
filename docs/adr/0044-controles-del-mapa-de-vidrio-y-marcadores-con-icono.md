# ADR 0044 · Los controles del mapa de vidrio y los marcadores con el ícono de su comida

- Estado: aceptada
- Fecha: 2026-11-15
- Precisa: ADR 0016 (la capa de restaurantes: sus marcadores ahora llevan un ícono por categoría), ADR 0036 (los íconos de comida, ahora también en el mapa), ADR 0040 (la base visual: el vidrio solo en los controles, «Reducir transparencia» y «Reducir movimiento») y ADR 0041 (la navegación del celular: el zoom y el botón «i»).
- Afecta a: `resources/css/map.css`, `resources/js/components/RestaurantsLayer.vue` y sus pruebas.

## Contexto

Tercera etapa del rediseño del celular aprobado el 2026-11-06 (#140, M4). Los botones del mapa eran rectángulos del estilo de MapLibre, los puntos de los restaurantes eran círculos todos iguales y, con los grupos, se tapaban entre sí; el aviso de «¿Dónde estoy?» quedaba donde el botón «i» dejó de estar.

## Alternativas

- **Vidrio en todo el mapa o en el panel.** ADR 0040: el vidrio es solo de los controles y la navegación; el contenido va sólido. Descartada.
- **Quitar el zoom en cualquier pantalla táctil** (`pointer: coarse`). Dejaba sin alejar a quien usa una tableta con ratón o teclado, o no puede pellizcar. Descartada: se quita solo en el celular (táctil, sin hover y de menos de 768 px).
- **Un ícono distinto por restaurante.** Cientos de imágenes por mapa. Descartada: uno por categoría (la primera de las del restaurante), con el genérico para las que no tienen.
- **Cargar solo los íconos de las categorías que hay en pantalla.** Cada cambio de las imágenes reconstruye todo el grupo de la capa (ADR 0016), y en Roldanillo casi siempre están las seis categorías: el ahorro sería de unos kilobytes y el costo, reconstrucciones. Descartada: se cargan los seis, aparte de los círculos, que no los esperan.
- **No precargar la fuente de títulos en el celular** (el commit `d62982a`, revertido). Se midió en un navegador a 390 px: en el inicio solo 1 de 11 textos a la vista usa Bricolage, pero en la ficha (a donde llegan los enlaces compartidos) son 4 títulos, el nombre del restaurante entre ellos: sin el preload se pinta con la fuente de respaldo y salta al llegar la de la marca. La mejora no estaba medida y el costo sí se ve: se precarga en todos los anchos, como antes.
- **Una clase propia para el grupo de zoom** (desde `engine.ts`), para no depender de `:has()`. Tocar el motor del mapa por un caso que ya degrada bien. Descartada: sin `:has()` (Safari anterior a 15.4, Firefox anterior a 121) solo queda un círculo de vidrio vacío, sin botones, y nada se rompe.

## Decisión

- **Controles de vidrio**: círculos de 44 px (el zoom, «¿Dónde estoy?» y el botón «i») con el fondo del tema al 46 % (la píldora del crédito, que lleva texto, al 70 %), desenfoque y saturación, y un filo claro arriba con una sombra suave en lugar del borde plano; el color se define una vez (`--veni-glass`) y los filtros llevan el prefijo `-webkit-`. Al 82 %, como estuvo al principio, no se veía nada a través del botón: era casi un círculo blanco. Con «Reducir transparencia» o sin soporte para desenfocar, el fondo sólido del tema.
- **Zoom**: se oculta solo con `(pointer: coarse) and (hover: none) and (max-width: 767px)`. El aviso de ubicación baja bajo el botón «i», que ya no tapa, y respeta el margen del sistema a los lados; su sombra pesada pasa a un borde fino, como los controles.
- **Marcadores**: cada restaurante se dibuja con el ícono de su primera categoría, en blanco sobre el círculo arrebol; un ícono que no baja cae al genérico y no deja un círculo vacío. Los grupos se forman a 44 px (antes 50) y el aro del elegido es más grande.
- **Fuente de títulos**: precargada en todos los anchos (ver arriba).

## Contraste, medido contra los colores del estilo de veni-mapa

Calculado con los colores de relleno de los estilos claro y oscuro publicados (16 rellenos cada uno):

| Qué | Claro | Oscuro |
| --- | --- | --- |
| Ícono (`--ink`) sobre el vidrio al 46 %, en el peor relleno | 13,1:1 | 14,5:1 |
| Texto del crédito sobre su píldora al 70 %, en el peor relleno | 14,5:1 | 15,4:1 |
| Ícono blanco sobre el círculo arrebol | 3,5:1 | 3,5:1 |
| Círculo arrebol contra los rellenos | 2,3 a 3,0:1 | 3,6 a 5,3:1 |

- El vidrio y el ícono pasan con mucho margen aun al 46 %. Se midió contra los rellenos, no contra las calles ni los rótulos que pasen por debajo: el desenfoque de 12 px los difumina, pero hay que mirarlo en un celular real.
- En el tema claro el círculo arrebol y su aro quedan entre 2,3 y 3,0:1 contra los rellenos: por debajo de 3:1 (WCAG 1.4.11) en el fondo del mapa (2,99) y en parques y agua. No es lo único que dice cuál restaurante es: el resumen se abre con su nombre, el mapa lo centra y el ícono blanco va dentro del círculo a 3,5:1. Se acepta como énfasis redundante; si se quiere cumplirlo en el mapa mismo, hace falta un contorno que dependa del tema (la capa hoy no lo conoce).

## Consecuencias

- Sin cambios de PHP ni de contratos; sin textos nuevos.
- En tabletas con ratón o teclado el zoom sigue a la vista.
- Pendiente fuera de este repositorio: los nombres del pueblo y de las vías por encima de los grupos (toca `veni-mapa`).
- Pendiente de mirar en un celular real: el mapa con los marcadores a 320 y 390 px en claro y oscuro.
