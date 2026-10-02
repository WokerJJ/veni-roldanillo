/**
 * El mapa no se puede mostrar y no es por la conexión de quien visita: el
 * navegador no pudo crearlo (sin WebGL) o a la app le falta la URL del estilo.
 * Quien pinta el mapa lo distingue para no pedirle que revise su conexión.
 */
export class MapUnavailableError extends Error {
    override readonly name = 'MapUnavailableError';
}
