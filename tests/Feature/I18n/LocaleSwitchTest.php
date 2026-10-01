<?php

use App\Enums\Locale;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

/*
| Cambio de idioma desde el selector (ADR 0010): PUT /locale guarda la cookie
| y, si hay sesión, la preferencia de la cuenta, y vuelve a la página anterior.
*/

uses(RefreshDatabase::class);

test('guarda el idioma en la cookie por un año y vuelve a la página anterior', function () {
    $response = $this->from('/')->put('/locale', ['locale' => 'en']);

    $response->assertRedirect('/')->assertCookie('locale', 'en', false);

    $cookie = $response->getCookie('locale', false);
    expect($cookie?->getSameSite())->toBe('lax')
        ->and($cookie?->isHttpOnly())->toBeTrue()
        ->and($cookie?->getExpiresTime())->toBeGreaterThan(now()->addDays(364)->getTimestamp());
});

test('con sesión también guarda el idioma en la cuenta', function () {
    $user = User::factory()->create(['locale' => Locale::Es]);

    $this->actingAs($user)
        ->from('/')
        ->put('/locale', ['locale' => 'en'])
        ->assertRedirect('/')
        ->assertCookie('locale', 'en', false);

    expect($user->fresh()?->locale)->toBe(Locale::En);
});

test('en una visita de Inertia responde 303 para que el navegador siga con GET', function () {
    $this->withHeader('X-Inertia', 'true')
        ->from('/')
        ->put('/locale', ['locale' => 'en'])
        ->assertStatus(303)
        ->assertRedirect('/');
});

test('quita ?lang de la página anterior para que no vuelva a imponer el otro idioma', function () {
    $this->from('/?lang=es&categoria=parrilla')
        ->put('/locale', ['locale' => 'en'])
        ->assertRedirect('/?categoria=parrilla');
});

test('no redirige fuera del sitio', function (string $referer) {
    $this->withHeader('Referer', $referer)
        ->put('/locale', ['locale' => 'en'])
        ->assertRedirect(route('home'))
        ->assertCookie('locale', 'en', false);
})->with([
    'otro dominio' => ['https://example.com/pagina?lang=es'],
    'sin esquema' => ['//example.com/pagina'],
    'no es una URL' => ['http://exa mple.com:puerto'],
]);

test('rechaza un idioma sin soporte y no guarda nada', function (mixed $locale) {
    $user = User::factory()->create(['locale' => Locale::Es]);

    $this->actingAs($user)
        ->from('/')
        ->put('/locale', ['locale' => $locale])
        ->assertRedirect('/')
        ->assertSessionHasErrors('locale')
        ->assertCookieMissing('locale');

    expect($user->fresh()?->locale)->toBe(Locale::Es);
})->with([
    'idioma desconocido' => ['fr'],
    'vacío' => [''],
    'arreglo' => [['en']],
]);

test('el selector cambia el idioma solo con PUT /locale', function () {
    $route = Route::getRoutes()->getByName('locale.update');

    // El mismo método y literal que pide el frontend: useI18n.test.ts comprueba la petición.
    expect(route('locale.update', absolute: false))->toBe('/locale')
        ->and($route?->methods())->toBe(['PUT']);
});
