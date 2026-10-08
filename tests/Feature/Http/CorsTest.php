<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| CORS (config/cors.php): la app pide su API desde su mismo origen, así que
| ninguna respuesta le da permiso a otro. Sin esa configuración Laravel abre
| /api/* a cualquier origen (Access-Control-Allow-Origin: *), también en los
| errores y en la consulta previa del navegador, y cada ruta nueva lo hereda.
*/

const CORS_OTHER_ORIGIN = 'https://otro.example';
const CORS_API_URL = '/api/restaurants.geojson';

/**
 * Las cabeceras Access-Control-* de la respuesta.
 *
 * @param  TestResponse<Response>  $response
 * @return list<string>
 */
function corsHeaders(TestResponse $response): array
{
    return array_values(array_filter(
        array_keys($response->headers->all()),
        fn (string $name): bool => str_starts_with($name, 'access-control-'),
    ));
}

test('un GET desde otro origen no trae Access-Control-Allow-Origin', function () {
    $response = $this->withHeaders(['Origin' => CORS_OTHER_ORIGIN])->get(CORS_API_URL)->assertOk();

    expect($response->headers->has('Access-Control-Allow-Origin'))->toBeFalse()
        ->and(corsHeaders($response))->toBe([]);
});

test('tampoco la respuesta sin cambios (304)', function () {
    $etag = $this->get(CORS_API_URL)->headers->get('ETag');

    $response = $this->withHeaders(['Origin' => CORS_OTHER_ORIGIN, 'If-None-Match' => $etag])->get(CORS_API_URL)->assertStatus(304);

    expect(corsHeaders($response))->toBe([]);
});

test('tampoco el error de un método que la ruta no tiene (405)', function () {
    $response = $this->withHeaders(['Origin' => CORS_OTHER_ORIGIN])->post(CORS_API_URL)->assertStatus(405);

    expect(corsHeaders($response))->toBe([]);
});

test('la consulta previa del navegador (preflight) no autoriza nada', function () {
    $response = $this->withHeaders([
        'Origin' => CORS_OTHER_ORIGIN,
        'Access-Control-Request-Method' => 'GET',
    ])->options(CORS_API_URL);

    expect(corsHeaders($response))->toBe([]);
});

test('una ruta nueva bajo /api tampoco queda abierta a otros orígenes', function () {
    Route::get('/api/_prueba/cors', fn () => ['ok' => true]);

    $response = $this->withHeaders(['Origin' => CORS_OTHER_ORIGIN])->get('/api/_prueba/cors')->assertOk();

    expect(corsHeaders($response))->toBe([]);
});
