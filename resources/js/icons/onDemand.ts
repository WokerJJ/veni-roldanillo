/*
| Los íconos que no son del layout, un chunk por ícono (icons.ts). Este mapa
| (nombre de archivo → chunk) también es un chunk aparte, que icons.ts pide la
| primera vez que hace falta un ícono bajo demanda: tiene una entrada por
| ícono y, en el arranque, crecería con el set (resources/js/map/bundle.test.ts).
|
| El patrón tiene que ser literal: repite, negada, la lista de los críticos de icons.ts.
|
| Con él viaja el mapa de los propios (veni.ts, ADR 0036): un solo chunk que
| pedir, y el arranque no carga un import() más.
*/
export { veniIcons } from './veni';

export const onDemand = import.meta.glob<string>(['./*.svg', '!./{idioma,luna,sol}.svg'], {
    base: '../../icons/colombia',
    query: '?raw',
    import: 'default',
});
