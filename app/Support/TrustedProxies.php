<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Proxies de los que la aplicación acepta las cabeceras `X-Forwarded-*`
 * (ADR 0014): la IP del cliente, el esquema (https), el host y el puerto con
 * que llegó la petición al proxy que termina TLS.
 *
 * Sale de `TRUSTED_PROXIES`, una lista de IP o rangos CIDR separados por
 * comas. Sin valor no se confía en nadie: las cabeceras se ignoran y la IP es
 * la de quien abre la conexión. `*` confía en cualquiera que se conecte; no es
 * el valor por defecto en ningún entorno y no se recomienda (docs/despliegue.md).
 */
final class TrustedProxies
{
    /**
     * @return '*'|list<string> `*` o la lista, vacía si no hay ninguno.
     *
     * @throws InvalidArgumentException si una entrada no es una IP ni un rango CIDR:
     *                                  un valor mal escrito no puede terminar en «no confiar en
     *                                  nadie» sin que nadie se entere.
     */
    public static function parse(mixed $value): string|array
    {
        if ($value === null || $value === false) {
            return [];
        }

        if (! is_string($value)) {
            throw new InvalidArgumentException('TRUSTED_PROXIES tiene que ser una lista de IP o rangos CIDR separados por comas.');
        }

        if (trim($value) === '*') {
            return '*';
        }

        $proxies = [];

        foreach (explode(',', $value) as $entry) {
            $entry = trim($entry);

            if ($entry === '') {
                continue;
            }

            if (! self::isIpOrCidr($entry)) {
                throw new InvalidArgumentException("TRUSTED_PROXIES: «{$entry}» no es una IP ni un rango CIDR.");
            }

            $proxies[] = $entry;
        }

        return array_values(array_unique($proxies));
    }

    private static function isIpOrCidr(string $entry): bool
    {
        [$address, $mask] = array_pad(explode('/', $entry, 2), 2, null);

        $isV4 = filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
        $isV6 = ! $isV4 && filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;

        if (! $isV4 && ! $isV6) {
            return false;
        }

        if ($mask === null) {
            return true;
        }

        return ctype_digit($mask) && (int) $mask <= ($isV4 ? 32 : 128);
    }
}
