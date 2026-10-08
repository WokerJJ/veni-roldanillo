<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RestaurantsGeoJsonRequest;
use App\Http\Resources\RestaurantFeatureCollection;
use App\Models\Restaurant;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * Los restaurantes publicados como capa GeoJSON del mapa (#9, ADR 0007).
 *
 * Público y sin sesión (routes/api.php). La caché y el límite de peticiones
 * los ponen los middleware de la ruta; qué campos salen, RestaurantFeature.
 */
class RestaurantGeoJsonController extends Controller
{
    /**
     * Hasta cuántos días adelante viajan los horarios especiales. El
     * dispositivo calcula con ellos «abierto ahora» y cuándo vuelve a abrir, y
     * no busca más allá de una semana.
     */
    public const SPECIAL_HOURS_DAYS_AHEAD = 7;

    public function __invoke(RestaurantsGeoJsonRequest $request): RestaurantFeatureCollection
    {
        // El día en Colombia, aunque el reloj del servidor estuviera en otra zona.
        $today = CarbonImmutable::now(config()->string('app.timezone'))->startOfDay();
        // Desde ayer: una franja de ayer puede pasar la medianoche y seguir abierta hoy.
        $from = $today->subDay()->toDateString();
        $until = $today->addDays(self::SPECIAL_HOURS_DAYS_AHEAD)->toDateString();

        // Cuatro consultas, haya un restaurante o trescientos: la de
        // restaurantes (con si tiene zonas de domicilio) y una por relación.
        $restaurants = Restaurant::query()
            ->published()
            ->select(['id', 'slug', 'name', 'location', 'delivery', 'is_fictitious'])
            ->withExists('deliveryZones')
            ->with([
                'categories' => function (Relation $categories): void {
                    $categories
                        ->select(['categories.id', 'categories.slug', 'categories.name_es', 'categories.name_en'])
                        ->orderBy('categories.position')
                        ->orderBy('categories.id');
                },
                'openingHours' => function (Relation $hours): void {
                    $hours
                        ->select(['id', 'restaurant_id', 'weekday', 'opens_at', 'closes_at'])
                        ->orderBy('weekday')
                        ->orderBy('opens_at');
                },
                'specialHours' => function (Relation $days) use ($from, $until): void {
                    $days
                        ->select(['id', 'restaurant_id', 'on_date', 'closed', 'opens_at', 'closes_at'])
                        ->whereBetween('on_date', [$from, $until])
                        ->orderBy('on_date')
                        ->orderBy('opens_at');
                },
            ])
            ->orderBy('id')
            ->get();

        return new RestaurantFeatureCollection($restaurants, $request->locale());
    }
}
