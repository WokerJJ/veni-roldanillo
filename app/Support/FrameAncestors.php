<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Orígenes que pueden mostrar la app dentro de un iframe (ADR 0014): el
 * `frame-ancestors` de la política de contenido. Sale de
 * `CSP_FRAME_ANCESTORS`, una lista de orígenes separados por comas. Sin
 * valor, ninguno (`'none'` y `X-Frame-Options: DENY`).
 *
 * Solo para entornos locales, como el tablero de avance que muestra la demo
 * en http://localhost:8765. En el servidor va vacío: cualquier sitio de la
 * lista podría mostrar la app debajo de sus propios botones (clickjacking).
 */
final class FrameAncestors
{
    /**
     * @return list<string> Los orígenes, vacía si no hay ninguno.
     *
     * @throws InvalidArgumentException si una entrada no es un origen http(s)
     *                                  (esquema, host y puerto, sin ruta): un
     *                                  valor mal escrito detiene el arranque en
     *                                  lugar de dejar una política que el
     *                                  navegador ignora.
     */
    public static function parse(mixed $value): array
    {
        if ($value === null || $value === false) {
            return [];
        }

        if (! is_string($value)) {
            throw new InvalidArgumentException('CSP_FRAME_ANCESTORS tiene que ser una lista de orígenes separados por comas.');
        }

        $origins = [];

        foreach (explode(',', $value) as $entry) {
            $entry = trim($entry);

            if ($entry === '') {
                continue;
            }

            $origin = Origin::fromUrl($entry);

            if ($origin === null || $origin !== strtolower(rtrim($entry, '/'))) {
                throw new InvalidArgumentException("CSP_FRAME_ANCESTORS: «{$entry}» no es un origen (por ejemplo http://localhost:8765).");
            }

            $origins[] = $origin;
        }

        return array_values(array_unique($origins));
    }

    /**
     * Los de la configuración (`security.csp.frame_ancestors`).
     *
     * @return list<string>
     */
    public static function configured(): array
    {
        $origins = config('security.csp.frame_ancestors');

        return is_array($origins) ? array_values(array_filter($origins, is_string(...))) : [];
    }
}
