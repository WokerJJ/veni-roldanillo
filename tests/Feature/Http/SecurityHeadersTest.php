<?php

use App\Http\Middleware\SetSecurityHeaders;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Http\Kernel as HttpKernel;
use Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| Cabeceras de seguridad (ADR 0014, App\Http\Middleware\SetSecurityHeaders):
| en todas las respuestas de Laravel, también en errores y redirecciones. HSTS
| solo en producción y cuando la petición llegó por HTTPS.
*/

beforeEach(function () {
    Route::get('/_prueba/cabeceras', fn () => 'ok');
});

/** @param TestResponse<Response> $response */
function securityHeadersAssertPresent(TestResponse $response): void
{
    $response->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('Permissions-Policy', SetSecurityHeaders::permissionsPolicy());
}

/**
 * Una petición que el proxy de confianza recibió por HTTPS.
 *
 * @return array{server: array<string, string>, headers: array<string, string>}
 */
function securityHeadersViaHttpsProxy(): array
{
    config(['trustedproxy.proxies' => ['172.18.0.1']]);

    return [
        'server' => ['REMOTE_ADDR' => '172.18.0.1'],
        'headers' => ['X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.7'],
    ];
}

test('una respuesta normal lleva las cabeceras de seguridad', function () {
    securityHeadersAssertPresent($this->get('/_prueba/cabeceras')->assertOk());
});

test('un 404 y una redirección también las llevan', function () {
    securityHeadersAssertPresent($this->get('/_prueba/no-existe')->assertNotFound());
    securityHeadersAssertPresent($this->from('/')->put('/locale', ['locale' => 'en'])->assertRedirect('/'));
});

test('Permissions-Policy deja la ubicación solo a este origen y apaga cámara, micrófono y pagos', function () {
    $policy = $this->get('/_prueba/cabeceras')->headers->get('Permissions-Policy');

    expect($policy)->toContain('geolocation=(self)')
        ->toContain('camera=()')
        ->toContain('microphone=()')
        ->toContain('payment=()')
        ->toContain('usb=()')
        ->not->toContain('*');
});

test('HSTS en producción cuando la petición llegó por HTTPS', function () {
    $this->app['env'] = 'production';
    $proxy = securityHeadersViaHttpsProxy();

    $this->withServerVariables($proxy['server'])
        ->withHeaders($proxy['headers'])
        ->get('/_prueba/cabeceras')
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

test('sin HSTS en producción por HTTP', function () {
    $this->app['env'] = 'production';

    $this->get('/_prueba/cabeceras')->assertHeaderMissing('Strict-Transport-Security');
});

test('sin HSTS por HTTPS fuera de producción', function () {
    $proxy = securityHeadersViaHttpsProxy();

    $this->withServerVariables($proxy['server'])
        ->withHeaders($proxy['headers'])
        ->get('/_prueba/cabeceras')
        ->assertHeaderMissing('Strict-Transport-Security');
});

test('sin HSTS si el X-Forwarded-Proto: https no viene de un proxy de confianza', function () {
    $this->app['env'] = 'production';
    config(['trustedproxy.proxies' => []]);

    $this->withHeaders(['X-Forwarded-Proto' => 'https'])
        ->get('/_prueba/cabeceras')
        ->assertHeaderMissing('Strict-Transport-Security');
});

test('envuelve al modo de mantenimiento y a los proxies de confianza', function () {
    $kernel = app(Kernel::class);
    assert($kernel instanceof HttpKernel);
    $global = $kernel->getGlobalMiddleware();

    // Inertia antepone su propio middleware al arrancar; el orden que importa
    // es que este vaya antes de los dos que pueden responder o cambiar la
    // petición: el modo de mantenimiento (503) y TrustProxies (isSecure()).
    $position = array_search(SetSecurityHeaders::class, $global, true);

    expect($position)->toBeInt()
        ->toBeLessThan(array_search(PreventRequestsDuringMaintenance::class, $global, true))
        ->toBeLessThan(array_search(TrustProxies::class, $global, true));
});
