<?php

use App\Filament\Owner\Pages\EditRestaurantProfile;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Si la base rechaza la ficha aunque pasó el formulario (#18, ADR 0025), el
 * aviso sale en el campo de la restricción que falló, o como aviso general
 * si no es de un campo del formulario. La prueba cambia el dato justo antes
 * de guardarlo para que el CHECK lo rechace de verdad.
 */
test('el aviso sale en el campo de la restricción que rechazó la ficha', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
    actInPanel(panelMember($restaurant), $restaurant);
    Restaurant::saving(function (Restaurant $restaurant): void {
        $restaurant->price_level = 9;
    });

    Livewire::test(EditRestaurantProfile::class)
        ->fillForm(['name' => 'Nuevo nombre'])
        ->call('save')
        ->assertHasFormErrors(['price_level'])
        ->assertHasNoFormErrors(['whatsapp']);

    expect($restaurant->refresh()->name)->toBe('Original');
});

test('una restricción que no es de un campo del formulario se avisa en general', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
    actInPanel(panelMember($restaurant), $restaurant);
    Restaurant::saving(function (Restaurant $restaurant): void {
        $restaurant->slug = 'No Válido';
    });

    Livewire::test(EditRestaurantProfile::class)
        ->fillForm(['name' => 'Nuevo nombre'])
        ->call('save')
        ->assertNotified(__('panel.errors.constraint'))
        ->assertHasNoFormErrors();

    expect($restaurant->refresh()->name)->toBe('Original');
});
