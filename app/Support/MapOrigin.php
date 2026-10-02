<?php

namespace App\Support;

/**
 * Origen (esquema, host y puerto) del que la app descarga el mapa de
 * veni-mapa (ADR 0007), para que la vista raíz adelante la conexión con
 * `<link rel="preconnect">` mientras baja el JavaScript.
 */
final class MapOrigin
{
    /**
     * @param  mixed  $styleUrl  `VITE_MAP_STYLE_URL` (config `services.map.style_url`): la plantilla `…/veni-{theme}-{locale}.json`.
     * @return string|null `null` si no es una URL http(s) con un host válido: la vista no pone el enlace.
     */
    public static function fromStyleUrl(mixed $styleUrl): ?string
    {
        if (! is_string($styleUrl)) {
            return null;
        }

        $parts = parse_url(trim($styleUrl));

        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        if (filter_var($parts['host'], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
            return null;
        }

        return $scheme.'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }
}
