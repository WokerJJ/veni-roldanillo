<?php

use Illuminate\Http\Middleware\TrustHosts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
| Proxies de confianza (ADR 0014). En producción TLS termina en un proxy que
| le pasa a la app el esquema y la IP del cliente en X-Forwarded-Proto y
| X-Forwarded-For, y el host con que llegó la petición en Host, tal cual.
| Esas dos cabeceras solo valen si la conexión llega desde una IP de
| TRUSTED_PROXIES (config trustedproxy.proxies); de cualquier otra, se
| ignoran. X-Forwarded-Host y X-Forwarded-Port no se aceptan de nadie, y el
| host tiene que ser el de APP_URL.
*/

beforeEach(function () {
    // APP_URL de producción: el sitio público, detrás del proxy que termina TLS.
    config(['app.url' => 'https://veniroldanillo.test']);

    Route::get('/_prueba/proxy', fn (Request $request) => [
        'url' => url('/'),
        'ip' => $request->ip(),
        'secure' => $request->isSecure(),
    ]);
});

/** La petición tal como el proxy se la pasa a la app: por HTTP y con el Host del sitio. */
function trustedProxiesSiteUrl(): string
{
    return 'http://veniroldanillo.test/_prueba/proxy';
}

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
    ];
}

/**
 * TrustHosts no actúa en las pruebas ni en desarrollo (APP_ENV local): esta
 * copia sí, como en producción.
 */
function trustedProxiesCheckHosts(): void
{
    app()->bind(TrustHosts::class, fn ($app) => new class($app) extends TrustHosts
    {
        protected function shouldSpecifyTrustedHosts(): bool
        {
            return true;
        }
    });
}

test('desde un proxy de confianza, las URL salen con https y la IP es la del cliente', function () {
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get(trustedProxiesSiteUrl())
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
        ->get(trustedProxiesSiteUrl())
        ->assertJsonPath('url', 'https://veniroldanillo.test')
        ->assertJsonPath('ip', '203.0.113.7');
});

test('desde una IP que no es de confianza ignora las cabeceras X-Forwarded-*', function () {
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.9'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get(trustedProxiesSiteUrl())
        ->assertExactJson([
            'url' => 'http://veniroldanillo.test',
            'ip' => '198.51.100.9',
            'secure' => false,
        ]);
});

test('sin TRUSTED_PROXIES no confía en nadie, ni siquiera en 127.0.0.1', function () {
    config(['trustedproxy.proxies' => []]);

    $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
        ->withHeaders(trustedProxiesForwardedHeaders())
        ->get(trustedProxiesSiteUrl())
        ->assertExactJson([
            'url' => 'http://veniroldanillo.test',
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
        ->get(trustedProxiesSiteUrl())
        ->assertJsonPath('ip', '203.0.113.7');
});

test('ignora X-Forwarded-Host y -Port aun del proxy de confianza: la URL lleva el host de APP_URL', function () {
    // Con ellos, quien lograra pasarlos por el proxy elegiría el host de los
    // enlaces que genera la app. El proxy ya manda el host real en Host.
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders([
            ...trustedProxiesForwardedHeaders(),
            'X-Forwarded-Host' => 'otro-sitio.example.test',
            'X-Forwarded-Port' => '8443',
        ])
        ->get(trustedProxiesSiteUrl())
        ->assertOk()
        ->assertJsonPath('url', rtrim((string) config('app.url'), '/'))
        ->assertJsonPath('secure', true);
});

test('no acepta X-Forwarded-Prefix ni siquiera de un proxy de confianza', function () {
    // Solo For y Proto (bootstrap/app.php): con el prefijo, quien pudiera
    // colarlo cambiaría la raíz de todas las URL que genera la app.
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders([...trustedProxiesForwardedHeaders(), 'X-Forwarded-Prefix' => '/otra-app'])
        ->get(trustedProxiesSiteUrl())
        ->assertJsonPath('url', 'https://veniroldanillo.test');
});

test('solo atiende el host de APP_URL, sin subdominios, y los nombres del propio equipo', function () {
    // Sin la página de depuración, como en producción.
    config(['app.debug' => false]);
    trustedProxiesCheckHosts();

    $this->get(trustedProxiesSiteUrl())->assertOk();
    // La revisión de salud de la imagen y deploy.sh piden /up a 127.0.0.1.
    $this->get('http://127.0.0.1:8000/_prueba/proxy')->assertOk();
    $this->get('http://localhost:8000/_prueba/proxy')->assertOk();

    $this->get('http://otro-sitio.example.test/_prueba/proxy')->assertBadRequest();
    $this->get('http://www.veniroldanillo.test/_prueba/proxy')->assertBadRequest();
    $this->get('http://veniroldanilloxtest/_prueba/proxy')->assertBadRequest();
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
