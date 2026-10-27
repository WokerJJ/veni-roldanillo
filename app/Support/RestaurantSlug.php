<?php

namespace App\Support;

use App\Models\Restaurant;
use Illuminate\Support\Str;

/**
 * El slug de una ficha nueva (su dirección pública, /restaurants/{slug}): del
 * nombre, en minúsculas y con guiones; si ya existe, con -2, -3… Lo usan la
 * importación de OpenStreetMap (ADR 0021) y el alta manual de administración
 * (ADR 0027). Un nombre sin letras ni números da «local».
 */
final class RestaurantSlug
{
    public const MAX_BASE = 120;

    public static function unique(string $name): string
    {
        $base = trim(Str::limit(Str::slug($name), self::MAX_BASE, ''), '-');

        if ($base === '') {
            $base = 'local';
        }

        $slug = $base;

        for ($n = 2; Restaurant::query()->where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
