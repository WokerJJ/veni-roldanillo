<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RestaurantsGeoJsonRequest;
use App\Http\Resources\RestaurantFeatureCollection;
use App\Models\Restaurant;

/**
 * Los restaurantes publicados como capa GeoJSON del mapa (#9, ADR 0007).
 *
 * Público y sin sesión (routes/api.php). La caché y el límite de peticiones
 * los ponen los middleware de la ruta; qué campos salen, RestaurantFeature.
 */
class RestaurantGeoJsonController extends Controller
{
    public function __invoke(RestaurantsGeoJsonRequest $request): RestaurantFeatureCollection
    {
        // Cuatro consultas, haya un restaurante o trescientos: la de
        // restaurantes (con si tiene zonas de domicilio) y una por relación.
        // Las categorías y el horario con que el dispositivo calcula
        // «abierto ahora» se cargan igual que en la ficha (ver Restaurant).
        $restaurants = Restaurant::query()
            ->published()
            ->select(['id', 'slug', 'name', 'location', 'delivery', 'is_fictitious'])
            ->withExists('deliveryZones')
            ->withPublicCategories()
            ->withPublicSchedule()
            ->orderBy('id')
            ->get();

        return new RestaurantFeatureCollection($restaurants, $request->locale());
    }
}
