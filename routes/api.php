<?php

use App\Http\Controllers\Api\RestaurantGeoJsonController;
use Illuminate\Support\Facades\Route;

/*
| Datos que la app pide con fetch, bajo /api y sin el grupo web: sin sesión,
| sin cookies y sin el idioma de la petición. Los errores salen como JSON
| (bootstrap/app.php).
*/

// Los restaurantes del mapa (#9). El idioma va en la URL (?lang=en), así que
// una URL es una sola respuesta y cualquier caché la puede guardar: un minuto,
// y después se revalida con el ETag (304 si nada cambió). El límite es por IP
// real (AppServiceProvider).
Route::get('/restaurants.geojson', RestaurantGeoJsonController::class)
    ->middleware(['throttle:restaurant-map', 'cache.headers:public;max_age=60;etag'])
    ->name('api.restaurants.geojson');
