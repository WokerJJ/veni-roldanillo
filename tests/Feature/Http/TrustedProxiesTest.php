<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
| Proxies de confianza (ADR 0014). En producción TLS termina en un proxy que
| le pasa a la app el esquema, el host, el puerto y la IP del cliente en las
| cabeceras X-Forwarded-*. Solo valen si la conexión llega desde una IP de
| TRUSTED_PROXIES (config trustedproxy.proxies); de cualquier otra, se ignoran.
*/

beforeEach(function () {
    Route::get('/_prueba/proxy', fn (Request $request) => [
        'url' => url('/'),
        'ip' => $request->ip(),
        'secure' => $request->isSecure(),
    ]);
});

/**
 * Lo que mandaría Caddy o cloudflared por una petición que le llegó por HTTPS.
 *
 * @return array<string, string>
 */
function trustedProxiesForwardedHeaders(string $clientIp = '203.0.113.7'): array
{
    return [
        'X-Forwarded-For' => $clientIp,
        'X-Forwarded-Proto' => 'https',
        'X-Forwarded-Host' => 'veniroldanillo.test',
        'X-Forwarded-Port' => '443',
    ];
}

/** La raíz sin proxy: la de APP_URL, por donde entran las peticiones de prueba (http). */
function trustedProxiesDirectUrl(): string
{
    return rtrim((string) config('app.url'), '/');
}

test('desde un proxy de confianza, las URL salen con https y la IP es la del cliente', function () {
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get('/_prueba/proxy')
        ->assertOk()
        ->assertExactJson([
            'url' => 'https://veniroldanillo.test',
            'ip' => '203.0.113.7',
            'secure' => true,
        ]);
});

test('acepta el proxy por rango CIDR', function () {
    config(['trustedproxy.proxies' => ['10.0.0.0/8']]);

    $this->withServerVariables(['REMOTE_ADDR' => '10.20.30.40'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get('/_prueba/proxy')
        ->assertJsonPath('url', 'https://veniroldanillo.test')
        ->assertJsonPath('ip', '203.0.113.7');
});

test('desde una IP que no es de confianza ignora las cabeceras X-Forwarded-*', function () {
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.9'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get('/_prueba/proxy')
        ->assertExactJson([
            'url' => trustedProxiesDirectUrl(),
            'ip' => '198.51.100.9',
            'secure' => false,
        ]);
});

test('sin TRUSTED_PROXIES no confía en nadie, ni siquiera en 127.0.0.1', function () {
    config(['trustedproxy.proxies' => []]);

    $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get('/_prueba/proxy')
        ->assertExactJson([
            'url' => trustedProxiesDirectUrl(),
            'ip' => '127.0.0.1',
            'secure' => false,
        ]);
});

test('una IP que el cliente escribe en X-Forwarded-For no reemplaza a la que vio el proxy', function () {
    // El proxy agrega al final la IP desde la que le llegó la petición; lo que
    // venga antes lo escribió el cliente y no es de fiar.
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(trustedProxiesForwardedHeaders('6.6.6.6, 203.0.113.7'))
        ->get('/_prueba/proxy')
        ->assertJsonPath('ip', '203.0.113.7');
});

test('no acepta X-Forwarded-Prefix ni siquiera de un proxy de confianza', function () {
    // Solo For, Host, Port y Proto (bootstrap/app.php): con el prefijo, quien
    // pudiera colarlo cambiaría la raíz de todas las URL que genera la app.
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders([...trustedProxiesForwardedHeaders(), 'X-Forwarded-Prefix' => '/otra-app'])
        ->get('/_prueba/proxy')
        ->assertJsonPath('url', 'https://veniroldanillo.test');
});

test('la lista sale de TRUSTED_PROXIES', function () {
    $previous = $_SERVER['TRUSTED_PROXIES'] ?? null;
    $_SERVER['TRUSTED_PROXIES'] = '172.18.0.1, 10.0.0.0/8';

    try {
        $config = require config_path('trustedproxy.php');
    } finally {
        if ($previous === null) {
            unset($_SERVER['TRUSTED_PROXIES']);
        } else {
            $_SERVER['TRUSTED_PROXIES'] = $previous;
        }
    }

    expect($config['proxies'])->toBe(['172.18.0.1', '10.0.0.0/8']);
});
