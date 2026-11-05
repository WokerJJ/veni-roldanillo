# Íconos propios de Vení

Completan los de [colombia-icons](../colombia/README.md) (ADR 0011), que tienen platos pero casi ningún ingrediente. La decisión está en el ADR 0036.

## Origen y licencia

Son dibujos propios del proyecto, no copiados de ningún sitio, y se publican bajo la licencia del repositorio (`LICENSE` en la raíz). No llevan el aviso MIT de colombia-icons porque no salen de ese set.

| Archivo | Qué es | Origen |
| --- | --- | --- |
| `generico.svg` | Un tazón con una hoja: el respaldo para lo que no tiene ícono | Dibujado para este repositorio |

Los íconos de ingredientes (tomate, cebolla, aguacate, cilantro, ajo, limón, arroz, fríjol, huevo, queso, plátano, papa…) los dibuja y aporta el autor del proyecto con la plantilla de 24 × 24 de la carpeta de diseño. Cada uno se agrega a la tabla de arriba al llegar.

## Cómo agregar uno

1. Copiá el SVG a esta carpeta con el nombre del ingrediente en minúsculas, sin tildes y con guiones: `tomate.svg`, `frijol.svg`, `platano-maduro.svg`. Ese nombre es la clave: la app lo encuentra sola (`import.meta.glob` en `resources/js/icons/veni.ts`), sin registrarlo en ningún lado.
2. Tiene que tener la forma de los de colombia-icons: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, puntas y uniones redondeadas, y solo elementos de dibujo (`path`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `rect`, `g`). Sin comentarios, texto, estilos, imágenes ni la cabecera `<?xml …?>` que deja Inkscape: el archivo empieza por `<svg `.
3. Anotalo en la tabla de arriba, con su origen: un SVG que no figura ahí no pasa.
4. `npm run icons:check` lo valida (corre dentro de `npm test`): la misma lista blanca que los de colombia-icons, la forma del paso 2 en la raíz (`viewBox`, `fill`, `stroke` y `stroke-width`), que adentro ningún `fill` ni `stroke` tenga un color fijo (solo `none` o `currentColor`, para que siga al tema oscuro) y que esté en la tabla.

Un ingrediente se empareja con su ícono por el nombre (ver `resources/js/icons/food.ts`): «Fríjoles», «FRÍJOL» y «Fríjol (prueba)» encuentran `frijol.svg`, y «Queso costeño» encuentra `queso.svg` si no hay `queso-costeno.svg`. Sin ícono, sale `generico.svg`.
