<?php

use App\Enums\Locale;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;

/*
| Orden de resolución del idioma (ADR 0010): ?lang, cookie, cuenta,
| Accept-Language y español por defecto.
|
| La cookie va sin cifrar (como la envía el navegador): withUnencryptedCookie.
*/

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
});

/** El idioma se ve en <html lang> (antes de que corra Vue) y en Content-Language. */
function assertServedIn(TestResponse $response, string $locale): void
{
    $response->assertOk()
        ->assertHeader('Content-Language', $locale)
        ->assertSee('<html lang="'.$locale.'"', false);
}

test('sin preferencias responde en español', function () {
    assertServedIn($this->get('/'), 'es');
});

test('Accept-Language elige el idioma según la preferencia del teléfono', function (string $header, string $expected) {
    assertServedIn($this->withHeader('Accept-Language', $header)->get('/'), $expected);
})->with([
    'inglés de EE. UU.' => ['en-US,en;q=0.9', 'en'],
    'español de Colombia' => ['es-CO,es;q=0.9,en;q=0.8', 'es'],
    'francés primero, luego inglés' => ['fr-FR,en;q=0.8,es;q=0.5', 'en'],
    'manda la calidad, no la posición' => ['es;q=0.5,en;q=0.9', 'en'],
    'q=0 significa «no»' => ['en;q=0', 'es'],
    'ningún idioma disponible' => ['de-DE,fr;q=0.9', 'es'],
    'comodín' => ['*', 'es'],
]);

test('la cuenta con sesión gana sobre Accept-Language', function () {
    $user = User::factory()->create(['locale' => Locale::En]);

    assertServedIn(
        $this->actingAs($user)->withHeader('Accept-Language', 'es-CO')->get('/'),
        'en',
    );
});

test('la cookie gana sobre la cuenta y sobre Accept-Language', function () {
    $user = User::factory()->create(['locale' => Locale::Es]);

    assertServedIn(
        $this->actingAs($user)
            ->withUnencryptedCookie('locale', 'en')
            ->withHeader('Accept-Language', 'es-CO')
            ->get('/'),
        'en',
    );
});

test('?lang gana sobre la cookie y la fija por un año', function () {
    $response = $this->withUnencryptedCookie('locale', 'es')->get('/?lang=en');

    assertServedIn($response, 'en');
    $response->assertCookie('locale', 'en', false);

    $cookie = $response->getCookie('locale', false);
    expect($cookie)->not->toBeNull()
        ->and($cookie->getSameSite())->toBe('lax')
        ->and($cookie->isHttpOnly())->toBeTrue()
        ->and($cookie->getPath())->toBe('/')
        ->and($cookie->getExpiresTime())->toBeGreaterThan(now()->addDays(364)->getTimestamp())
        ->and($cookie->getExpiresTime())->toBeLessThanOrEqual(now()->addDays(365)->getTimestamp());
});

test('?lang no cambia el idioma guardado en la cuenta', function () {
    $user = User::factory()->create(['locale' => Locale::Es]);

    assertServedIn($this->actingAs($user)->get('/?lang=en'), 'en');

    expect($user->fresh()?->locale)->toBe(Locale::Es);
});

test('sin ?lang no escribe la cookie', function () {
    $this->withHeader('Accept-Language', 'en-US')
        ->get('/')
        ->assertCookieMissing('locale');
});

test('un ?lang inválido se ignora: decide la cookie y no se reescribe', function (string $query) {
    $response = $this->withUnencryptedCookie('locale', 'en')->get('/?'.$query);

    assertServedIn($response, 'en');
    $response->assertCookieMissing('locale');
})->with([
    'idioma sin soporte' => ['lang=fr'],
    'vacío' => ['lang='],
    'arreglo' => ['lang[]=es'],
]);

test('una cookie inválida se ignora: decide Accept-Language', function () {
    assertServedIn(
        $this->withUnencryptedCookie('locale', 'fr')->withHeader('Accept-Language', 'en')->get('/'),
        'en',
    );
});

test('la respuesta declara que cambia según el idioma y la cookie', function () {
    // Se suma al Vary de Inertia (X-Inertia), no lo reemplaza.
    expect($this->get('/')->baseResponse->getVary())
        ->toContain('X-Inertia', 'Accept-Language', 'Cookie');
});
