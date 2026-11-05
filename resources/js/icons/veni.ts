/*
| Los íconos propios de Vení (ADR 0036): resources/icons/veni, uno por
| archivo, con el nombre en minúsculas y con guiones (`tomate.svg`). Agregar
| uno es copiar el archivo: este mapa lo registra solo, y `icons:check` lo
| valida con la misma lista blanca que los de colombia-icons.
|
| Cada ícono es un chunk que se pide la primera vez que se pinta; este mapa
| (nombre → chunk) viaja con quien lo importa: food.ts (en los chunks de la
| ficha, la lista y la guía) y onDemand.ts, que icons.ts pide con import().
| Nunca en el arranque (resources/js/map/bundle.test.ts).
|
| Las claves llevan la carpeta (`./veni/tomate.svg`), como el nombre del
| ícono en Icon (`veni/tomate`).
*/
export const veniIcons = import.meta.glob<string>('./veni/*.svg', {
    base: '../../icons',
    query: '?raw',
    import: 'default',
});
