<?php

use App\Http\Controllers\Api\DishSearchController;
use App\Http\Controllers\Api\OrderIntentController;
use App\Http\Controllers\Api\RestaurantGeoJsonController;
use App\Http\Middleware\RequireSameOriginJson;
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

// La búsqueda por plato (#17, ADR 0029): Meilisearch detrás de este endpoint,
// nunca desde el navegador. La caché (un minuto, o ninguna si Meilisearch no
// responde) la pone el controlador; el límite es por IP real.
Route::get('/dishes/search', DishSearchController::class)
    ->middleware('throttle:dish-search')
    ->name('api.dishes.search');

// El toque en «Enviar pedido por WhatsApp» (#22, ADR 0031): solo el
// restaurante y si era domicilio o recoger, para las estadísticas del dueño.
// Sin sesión ni cookies, así que no hay CSRF que verificar:
// RequireSameOriginJson exige JSON (un formulario de otro sitio no lo puede
// mandar sin CORS) y rechaza lo que el navegador marca como de otro sitio u
// otro origen. El límite es por IP (o /64), como huella HMAC.
Route::post('/restaurants/{slug}/order-intents', OrderIntentController::class)
    ->middleware(['throttle:order-intents', RequireSameOriginJson::class])
    ->name('api.order-intents.store');
