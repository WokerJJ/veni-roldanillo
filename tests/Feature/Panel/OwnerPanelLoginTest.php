<?php

use App\Models\Restaurant;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Límite de intentos del login del panel por cuenta (#18, ADR 0025), además
 * del de Filament por IP (5 por minuto): quien prueba claves contra un correo
 * desde muchas IP también se detiene.
 *
 * Las pruebas de Livewire no dejan elegir la IP de la petición; para que el
 * límite por IP no frene los intentos, cada cinco se deja pasar un minuto
 * (es lo que vería quien cambia de IP).
 */
function attemptPanelLogin(string $email, string $password): void
{
    Livewire::test(Filament::getPanel('owner')->getLoginRouteAction())
        ->fillForm(['email' => $email, 'password' => $password])
        ->call('authenticate');
}

function failPanelLogins(string $email, int $times): void
{
    foreach (range(1, $times) as $attempt) {
        attemptPanelLogin($attempt % 2 === 0 ? mb_strtoupper($email) : $email, 'equivocada');

        if ($attempt % 5 === 0) {
            test()->travel(61)->seconds();
        }
    }
}

test('al pasar el tope de intentos de una cuenta, ni con la clave correcta', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $owner->forceFill(['email' => 'duena@example.test', 'password' => 'clave-de-prueba'])->save();
    Filament::setCurrentPanel(Filament::getPanel('owner'));

    // El correo cambia de mayúsculas entre intentos: cuenta igual.
    failPanelLogins('duena@example.test', 10);

    attemptPanelLogin('duena@example.test', 'clave-de-prueba');
    $this->assertGuest();

    $this->travel(16)->minutes();

    attemptPanelLogin('duena@example.test', 'clave-de-prueba');
    $this->assertAuthenticatedAs($owner);
});

test('los intentos contra una cuenta no frenan a otra', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $owner->forceFill(['email' => 'duena@example.test', 'password' => 'clave-de-prueba'])->save();
    Filament::setCurrentPanel(Filament::getPanel('owner'));

    failPanelLogins('otra@example.test', 10);

    attemptPanelLogin('duena@example.test', 'clave-de-prueba');
    $this->assertAuthenticatedAs($owner);
});

test('el correo se escribe con mayúsculas y entra igual', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $owner->forceFill(['email' => 'duena@example.test', 'password' => 'clave-de-prueba'])->save();
    Filament::setCurrentPanel(Filament::getPanel('owner'));

    attemptPanelLogin('Duena@Example.TEST', 'clave-de-prueba');

    $this->assertAuthenticatedAs($owner);
});
