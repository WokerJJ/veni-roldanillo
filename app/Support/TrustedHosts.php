<?php

namespace App\Support;

/**
 * Hosts de los que la aplicación atiende peticiones (ADR 0014): el de
 * APP_URL, exacto y sin subdominios, y los nombres del propio equipo. Con
 * cualquier otro `Host`, Laravel responde 400 en lugar de generar enlaces
 * hacia un host que eligió quien hizo la petición.
 *
 * Los del propio equipo (127.0.0.1 y localhost): la revisión de salud de la
 * imagen y deploy.sh piden /up desde dentro del contenedor, y la imagen se
 * puede abrir en local con cualquiera de los dos. Un enlace hacia ellos no
 * lleva a nadie a otro sitio.
 *
 * Laravel no los comprueba en desarrollo (APP_ENV=local) ni en las pruebas.
 */
final class TrustedHosts
{
    private const LOOPBACK = ['127.0.0.1', 'localhost'];

    /**
     * @param  mixed  $appUrl  APP_URL (config `app.url`).
     * @return list<string> Patrones para Request::setTrustedHosts(). Sin un host
     *                      en APP_URL, solo los del propio equipo.
     */
    public static function patterns(mixed $appUrl): array
    {
        $host = is_string($appUrl) ? parse_url(trim($appUrl), PHP_URL_HOST) : null;
        $hosts = is_string($host) && $host !== '' ? [strtolower($host), ...self::LOOPBACK] : self::LOOPBACK;

        return array_values(array_map(
            fn (string $host): string => '^'.preg_quote($host).'$',
            array_unique($hosts),
        ));
    }
}
