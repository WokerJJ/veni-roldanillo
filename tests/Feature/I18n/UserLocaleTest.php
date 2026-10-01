<?php

use App\Enums\Locale;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Idioma preferido de la cuenta (ADR 0010): users.locale queda nulo hasta que
| la persona elige idioma con el selector. Mientras tanto decide el dispositivo
| (cookie o Accept-Language); un valor por defecto en la cuenta le ganaría al
| idioma del teléfono.
*/

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
});

test('una cuenta nueva no tiene idioma preferido', function () {
    expect((new User)->locale)->toBeNull()
        ->and(User::factory()->create()->fresh()?->locale)->toBeNull();
});

test('una cuenta sin preferencia usa Accept-Language', function (string $header, string $expected) {
    $user = User::factory()->create(['locale' => null]);

    $this->actingAs($user)
        ->withHeader('Accept-Language', $header)
        ->get('/')
        ->assertOk()
        ->assertHeader('Content-Language', $expected)
        ->assertSee('<html lang="'.$expected.'"', false);
})->with([
    'teléfono en inglés' => ['en-US,en;q=0.9', 'en'],
    'teléfono en español' => ['es-CO,es;q=0.9,en;q=0.8', 'es'],
]);

test('una cuenta sin preferencia usa la cookie del dispositivo', function () {
    $user = User::factory()->create(['locale' => null]);

    $this->actingAs($user)
        ->withUnencryptedCookie('locale', 'en')
        ->withHeader('Accept-Language', 'es-CO')
        ->get('/')
        ->assertOk()
        ->assertHeader('Content-Language', 'en');
});

test('el selector guarda la preferencia en una cuenta que no la tenía', function () {
    $user = User::factory()->create(['locale' => null]);

    $this->actingAs($user)
        ->from('/')
        ->put('/locale', ['locale' => 'en'])
        ->assertRedirect('/');

    expect($user->fresh()?->locale)->toBe(Locale::En);

    // Desde entonces la cuenta gana sobre el idioma del teléfono.
    $this->withHeader('Accept-Language', 'es-CO')
        ->get('/')
        ->assertHeader('Content-Language', 'en');
});

test('la columna admite nulo y no tiene valor por defecto', function () {
    $column = collect(Schema::getColumns('users'))->firstWhere('name', 'locale');

    expect($column)->not->toBeNull()
        ->and($column['nullable'])->toBeTrue()
        ->and($column['default'])->toBeNull();
});

test('la columna sigue admitiendo solo los idiomas del enum', function () {
    DB::table('users')->where('id', User::factory()->create()->id)->update(['locale' => 'fr']);
})->throws(QueryException::class, 'users_locale_check');
