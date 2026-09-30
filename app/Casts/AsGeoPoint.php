<?php

namespace App\Casts;

use App\Support\GeoPoint;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Convierte una columna geography(Point,4326) en GeoPoint y viceversa.
 *
 * @implements CastsAttributes<GeoPoint, mixed>
 */
class AsGeoPoint implements CastsAttributes
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?GeoPoint
    {
        if ($value === null) {
            return null;
        }

        if (! is_string($value)) {
            throw new InvalidArgumentException("El atributo {$key} no es un valor geográfico.");
        }

        return GeoPoint::parse($value);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        if (! $value instanceof GeoPoint) {
            throw new InvalidArgumentException("El atributo {$key} espera un GeoPoint.");
        }

        return $value->toEwkt();
    }
}
