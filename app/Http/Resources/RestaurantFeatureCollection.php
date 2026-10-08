<?php

namespace App\Http\Resources;

use App\Enums\Locale;
use App\Models\Restaurant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Los restaurantes del mapa como FeatureCollection de GeoJSON (RFC 7946).
 *
 * @phpstan-import-type Feature from RestaurantFeature
 */
class RestaurantFeatureCollection extends JsonResource
{
    public const CONTENT_TYPE = 'application/geo+json';

    /**
     * GeoJSON no admite un sobre: el objeto de arriba es la colección.
     *
     * @var string|null
     */
    public static $wrap = null;

    /**
     * @param  Collection<int, Restaurant>  $restaurants
     */
    public function __construct(
        private readonly Collection $restaurants,
        private readonly Locale $locale,
    ) {
        parent::__construct($restaurants);
    }

    /**
     * @return array{type: 'FeatureCollection', features: list<Feature>}
     */
    public function toArray(Request $request): array
    {
        $features = [];

        foreach ($this->restaurants as $restaurant) {
            $features[] = (new RestaurantFeature($restaurant, $this->locale))->toArray($request);
        }

        return ['type' => 'FeatureCollection', 'features' => $features];
    }

    /** Acentos y barras tal cual: menos bytes con datos móviles. */
    public function jsonOptions(): int
    {
        return JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    }

    public function withResponse(Request $request, JsonResponse $response): void
    {
        $response->header('Content-Type', self::CONTENT_TYPE);
        $response->header('Content-Language', $this->locale->value);
    }
}
