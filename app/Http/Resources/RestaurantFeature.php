<?php

namespace App\Http\Resources;

use App\Enums\Locale;
use App\Models\Category;
use App\Models\OpeningHour;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use LogicException;

/**
 * Un restaurante como figura (Feature) de GeoJSON para el mapa (#9).
 *
 * Es una lista blanca: lo que no está escrito aquí no sale, se llame como se
 * llame en la tabla. Nada de contacto, dirección, dueños, plan ni estado: el
 * mapa es público y su respuesta queda en cachés.
 *
 * No lleva si está abierto: eso cambia con el reloj y una respuesta guardada
 * lo diría mal. Lleva el horario, y el dispositivo calcula con su hora (ADR 0017).
 *
 * Espera las relaciones ya cargadas (categories, openingHours, specialHours)
 * y delivery_zones_exists: las carga RestaurantGeoJsonController en una
 * consulta por tabla.
 *
 * @phpstan-type FeatureCategory array{slug: string, name: string}
 * @phpstan-type FeatureHours array{weekday: int, opens: string, closes: string}
 * @phpstan-type FeatureSpecialHours array{date: string, closed: bool, opens: string|null, closes: string|null}
 * @phpstan-type Feature array{
 *     type: 'Feature',
 *     geometry: array{type: 'Point', coordinates: array{float, float}},
 *     properties: array{
 *         slug: string,
 *         name: string,
 *         categories: list<FeatureCategory>,
 *         delivery: bool,
 *         fictitious: bool,
 *         hours: list<FeatureHours>,
 *         special_hours: list<FeatureSpecialHours>,
 *     },
 * }
 */
class RestaurantFeature extends JsonResource
{
    /** Decimales de las coordenadas: seis son unos 10 cm. */
    private const COORDINATE_DECIMALS = 6;

    public function __construct(
        private readonly Restaurant $restaurant,
        private readonly Locale $locale,
    ) {
        parent::__construct($restaurant);
    }

    /**
     * @return Feature
     */
    public function toArray(Request $request): array
    {
        $restaurant = $this->restaurant;
        $location = $restaurant->location;

        return [
            'type' => 'Feature',
            'geometry' => [
                'type' => 'Point',
                // GeoJSON: primero la longitud.
                'coordinates' => [
                    round($location->longitude, self::COORDINATE_DECIMALS),
                    round($location->latitude, self::COORDINATE_DECIMALS),
                ],
            ],
            'properties' => [
                'slug' => $restaurant->slug,
                'name' => $restaurant->name,
                'categories' => array_values($restaurant->categories
                    ->map(fn (Category $category): array => [
                        'slug' => $category->slug,
                        'name' => (string) $category->translated('name', $this->locale),
                    ])
                    ->all()),
                // Las zonas mandan sobre la casilla (ver Restaurant).
                'delivery' => $restaurant->delivery || $restaurant->getAttribute('delivery_zones_exists') === true,
                'fictitious' => $restaurant->is_fictitious,
                'hours' => array_values($restaurant->openingHours
                    ->map(fn (OpeningHour $slot): array => [
                        'weekday' => $slot->weekday,
                        'opens' => self::time($slot->opens_at),
                        'closes' => self::time($slot->closes_at),
                    ])
                    ->all()),
                'special_hours' => array_values($restaurant->specialHours
                    ->map(fn (SpecialHour $day): array => [
                        'date' => $day->on_date->toDateString(),
                        'closed' => $day->closed,
                        'opens' => $day->opens_at === null ? null : self::time($day->opens_at),
                        'closes' => $day->closes_at === null ? null : self::time($day->closes_at),
                    ])
                    ->all()),
            ],
        ];
    }

    /** «11:00:00» de PostgreSQL → «11:00»: los horarios van al minuto. */
    private static function time(string $value): string
    {
        if (preg_match('/^\d{2}:\d{2}/', $value, $match) !== 1) {
            throw new LogicException("«{$value}» no es una hora.");
        }

        return $match[0];
    }
}
