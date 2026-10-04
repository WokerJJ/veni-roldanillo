<?php

use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

/*
| Cookies seguras (ADR 0014). La imagen de producción fija
| SESSION_SECURE_COOKIE=true (Dockerfile): la sesión, el token CSRF y el idioma
| salen con Secure y el navegador no los manda nunca por HTTP. Donde la variable
| no está (desarrollo), la cookie del idioma lleva Secure solo si la petición
| llegó por HTTPS, según el proxy de confianza. SameSite es Lax en todas: van en
| la navegación desde otro sitio (un enlace compartido por WhatsApp) pero no en
| las peticiones que otro sitio haga a esta app.
*/

beforeEach(function () {
    // La página de inicio pinta las etiquetas de @vite: con el manifest propio
    // (tests/Pest.php) no depende de `npm run build`.
    fakeViteManifest();
});

/** @return array<string, Cookie> */
function secureCookiesByName(Response $response): array
{
    $cookies = [];

    foreach ($response->headers->getCookies() as $cookie) {
        $cookies[$cookie->getName()] = $cookie;
    }

    return $cookies;
}

test('con SESSION_SECURE_COOKIE la sesión, el token CSRF y el idioma son Secure y SameSite Lax', function () {
    config(['session.secure' => true]);

    $cookies = secureCookiesByName($this->get('/?lang=en')->assertOk()->baseResponse);
    $session = (string) config('session.cookie');

    expect($cookies)->toHaveKeys([$session, 'XSRF-TOKEN', 'locale']);

    foreach ([$session, 'XSRF-TOKEN', 'locale'] as $name) {
        expect($cookies[$name]->isSecure())->toBeTrue("{$name} no es Secure")
            ->and($cookies[$name]->getSameSite())->toBe(Cookie::SAMESITE_LAX, "{$name} no es SameSite=Lax");
    }

    // La sesión y el idioma no los lee JavaScript; el token CSRF sí (Inertia lo
    // manda en X-XSRF-TOKEN), por eso no puede ser HttpOnly.
    expect($cookies[$session]->isHttpOnly())->toBeTrue()
        ->and($cookies['locale']->isHttpOnly())->toBeTrue()
        ->and($cookies['XSRF-TOKEN']->isHttpOnly())->toBeFalse();
});

test('con SESSION_SECURE_COOKIE el selector de idioma deja la cookie con Secure', function () {
    config(['session.secure' => true]);

    $cookie = $this->from('/')->put('/locale', ['locale' => 'en'])->getCookie('locale', false);

    expect($cookie?->isSecure())->toBeTrue();
});

test('sin SESSION_SECURE_COOKIE, la cookie del idioma es Secure cuando la petición llegó por HTTPS', function () {
    config(['session.secure' => null, 'trustedproxy.proxies' => ['172.18.0.1']]);

    $cookie = $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(['X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.7'])
        ->from('/')
        ->put('/locale', ['locale' => 'en'])
        ->getCookie('locale', false);

    expect($cookie?->isSecure())->toBeTrue();
});

test('sin SESSION_SECURE_COOKIE y por HTTP la cookie del idioma no lleva Secure', function () {
    // Desarrollo en http://localhost: con Secure el navegador podría no guardarla.
    config(['session.secure' => null]);

    $cookie = $this->from('/')->put('/locale', ['locale' => 'en'])->getCookie('locale', false);

    expect($cookie?->isSecure())->toBeFalse();
});
