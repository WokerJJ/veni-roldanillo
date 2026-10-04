<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;

/*
| Páginas de error propias (resources/views/errors, ADR 0014): textos de
| lang/{idioma}.json con la voz de la marca y colores de brand/tokens.css.
| Salen en el idioma de la petición aunque SetLocale no haya corrido (una ruta
| que no existe no pasa por el grupo web), con el mismo orden que él: ?lang,
| cookie, Accept-Language y español; la cuenta, solo si SetLocale ya la leyó.
*/

uses(RefreshDatabase::class);

beforeEach(function () {
    // Como en producción: la página de error, no la de depuración.
    config(['app.debug' => false]);
    Exceptions::fake();

    // Sin el grupo web: SetLocale no corre, como en una ruta que no existe.
    Route::get('/_prueba/error/{status}', fn (int $status) => abort($status));
});

test('cada página de error trae su texto en el idioma de la petición', function (int $status, string $key, string $locale) {
    $title = trans("errors.{$key}.title", [], $locale);
    $message = trans("errors.{$key}.message", [], $locale);

    // Si faltara la traducción, trans() devolvería la clave.
    expect($title)->not->toBe("errors.{$key}.title")
        ->and($message)->not->toBe("errors.{$key}.message");

    $this->withHeader('Accept-Language', $locale)
        ->get("/_prueba/error/{$status}")
        ->assertStatus($status)
        ->assertSee('<html lang="'.$locale.'"', false)
        ->assertSee('<title>'.e($title).'</title>', false)
        ->assertSee(e($message), false)
        ->assertSee('<a href="/">'.e(trans('errors.home', [], $locale)).'</a>', false);
})->with([
    '404' => [404, 'not_found'],
    '419' => [419, 'page_expired'],
    '429' => [429, 'too_many_requests'],
    '500' => [500, 'server_error'],
    '503' => [503, 'maintenance'],
])->with(['es', 'en']);

test('el 404 de una ruta que no existe sigue el orden de SetLocale', function (array $headers, ?string $cookie, string $query, string $locale) {
    if ($cookie !== null) {
        $this->withUnencryptedCookie('locale', $cookie);
    }

    $this->withHeaders($headers)
        ->get('/_prueba/no-existe'.$query)
        ->assertNotFound()
        ->assertSee('<html lang="'.$locale.'"', false)
        ->assertSee(e(trans('errors.not_found.title', [], $locale)), false);
})->with([
    'sin nada, español' => [[], null, '', 'es'],
    'el teléfono en inglés' => [['Accept-Language' => 'en-US,en;q=0.9'], null, '', 'en'],
    'la cookie gana al teléfono' => [['Accept-Language' => 'es-CO'], 'en', '', 'en'],
    '?lang gana a la cookie' => [[], 'es', '?lang=en', 'en'],
    'un valor inválido no decide' => [['Accept-Language' => 'en'], 'fr', '?lang=xx', 'en'],
]);

test('no hereda el idioma de la petición anterior (Octane)', function () {
    // Las dos peticiones pasan por la misma aplicación, como en un worker.
    $this->get('/_prueba/no-existe?lang=en')->assertSee('<html lang="en"', false);

    $this->get('/_prueba/no-existe')->assertSee('<html lang="es"', false);
});

test('si SetLocale ya decidió, con la cuenta, la página de error lo respeta', function () {
    $user = User::factory()->create(['locale' => 'en']);
    Route::middleware('web')->get('/_prueba/error-web', fn () => abort(404));

    $this->actingAs($user)
        ->get('/_prueba/error-web')
        ->assertNotFound()
        ->assertSee('<html lang="en"', false);
});

test('los colores salen de los tokens de la marca, sin copiarlos', function () {
    $tokens = File::get(base_path('brand/tokens.css'));

    expect($tokens)->toContain('--veni-ciruela:');

    $this->get('/_prueba/no-existe')
        ->assertNotFound()
        ->assertSee(trim($tokens), false);

    // Ningún color escrito a mano en la base de las páginas de error.
    expect(File::get(resource_path('views/errors/minimal.blade.php')))
        ->not->toMatch('/#[0-9a-fA-F]{3,8}\b/')
        ->not->toMatch('/\brgba?\(/');
});
