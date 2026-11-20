<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Una variable de entorno que tiene que ser true o false. Un valor que no lo es
 * («ture») detiene la carga de la configuración en vez de leerse como false:
 * con ROBOTS_NOINDEX, un error de escritura dejaría el dominio de pruebas
 * indexable sin que nadie se enterara (ADR 0049).
 */
final class StrictBoolean
{
    public static function parse(string $name, mixed $value): bool
    {
        $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        if ($parsed === null) {
            throw new InvalidArgumentException("{$name} tiene que ser true o false.");
        }

        return $parsed;
    }
}
