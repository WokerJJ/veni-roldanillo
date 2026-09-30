<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Punto WGS 84 (SRID 4326) de una columna geography(Point,4326).
 */
final readonly class GeoPoint
{
    public function __construct(
        public float $latitude,
        public float $longitude,
    ) {
        // NaN falla todas las comparaciones y pasaría el rango: is_finite primero.
        if (! is_finite($latitude) || ! is_finite($longitude)) {
            throw new InvalidArgumentException('Las coordenadas deben ser números finitos.');
        }

        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            throw new InvalidArgumentException('Coordenadas fuera de rango.');
        }
    }

    /**
     * EWKT que PostgreSQL convierte a geography al insertar (orden: longitud, latitud).
     */
    public function toEwkt(): string
    {
        return sprintf('SRID=4326;POINT(%.7F %.7F)', $this->longitude, $this->latitude);
    }

    /**
     * Lee lo que devuelve PostgreSQL (EWKB en hexadecimal) o un EWKT/WKT de punto.
     */
    public static function parse(string $value): self
    {
        if (preg_match('/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i', $value, $m) === 1) {
            return new self((float) $m[2], (float) $m[1]);
        }

        if (preg_match('/^[0-9a-fA-F]+$/', $value) !== 1 || strlen($value) % 2 !== 0) {
            throw new InvalidArgumentException('Valor geográfico no reconocido.');
        }

        return self::fromEwkb((string) hex2bin($value));
    }

    private static function fromEwkb(string $wkb): self
    {
        if (strlen($wkb) < 21) {
            throw new InvalidArgumentException('EWKB demasiado corto para un punto.');
        }

        $littleEndian = ord($wkb[0]) === 1;
        $uint = $littleEndian ? 'V' : 'N';
        $double = $littleEndian ? 'e' : 'E';

        /** @var array{1: int} $type */
        $type = unpack($uint, $wkb, 1);
        $offset = 5;

        // Bit 0x20000000: el EWKB trae el SRID después del tipo.
        if (($type[1] & 0x20000000) !== 0) {
            $offset += 4;
        }

        if (($type[1] & 0xFF) !== 1 || strlen($wkb) < $offset + 16) {
            throw new InvalidArgumentException('El valor geográfico no es un punto.');
        }

        /** @var array{1: float} $x */
        $x = unpack($double, $wkb, $offset);
        /** @var array{1: float} $y */
        $y = unpack($double, $wkb, $offset + 8);

        return new self($y[1], $x[1]);
    }
}
