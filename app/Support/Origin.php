<?php

namespace App\Support;

/**
 * Origen (esquema, host y puerto) de una URL http(s), tal como lo nombran la
 * política de seguridad de contenido y `<link rel="preconnect">`.
 */
final class Origin
{
    /**
     * @return string|null `null` si no es una URL http(s) con un nombre de host
     *                     válido: quien la usa no pone el enlace ni la fuente.
     *                     Una IPv6 literal (`[::1]`) tampoco sirve: la CSP no
     *                     puede nombrarla.
     */
    public static function fromUrl(mixed $url): ?string
    {
        if (! is_string($url)) {
            return null;
        }

        $parts = parse_url(trim($url));

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

        return $scheme.'://'.strtolower($parts['host']).(isset($parts['port']) ? ':'.$parts['port'] : '');
    }
}
