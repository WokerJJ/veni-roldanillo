<?php

namespace App\Support;

/**
 * Celular colombiano como lo guarda la base: 57 + diez dígitos que empiezan
 * por 3 (el CHECK de las solicitudes de #20 pide lo mismo).
 */
final class ColombianMobile
{
    /**
     * Quita espacios, «+», guiones, puntos y paréntesis y antepone 57 a un
     * celular de diez dígitos. Devuelve null si no queda un celular válido.
     */
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $digits = (string) preg_replace('/[\s+\-.()]/u', '', $value);

        if (preg_match('/^3\d{9}$/', $digits) === 1) {
            $digits = '57'.$digits;
        }

        return preg_match('/^573\d{9}$/', $digits) === 1 ? $digits : null;
    }
}
