<?php

use App\Filament\Owner\Resources\MenuSections\Pages\EditMenuSection;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Filament\Actions\DeleteAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Borrar desde el panel del dueño (#18, ADR 0025): si la base no deja borrar
 * (una sección con platos, por la FK de dishes), el dueño ve un aviso y nada
 * cambia; no un error 500.
 */
test('borrar una sección que tiene platos avisa, no lanza y la sección sigue', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $section = panelDish($restaurant)->menuSection;
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditMenuSection::class, ['record' => $section->getRouteKey()])
        ->callAction(DeleteAction::class)
        ->assertNotified(__('panel.errors.delete_blocked'))
        ->assertNoRedirect();

    expect(MenuSection::query()->whereKey($section->id)->exists())->toBeTrue()
        ->and($restaurant->refresh()->updated_by_owner_at)->toBeNull();
});

test('una sección sin platos se borra y mueve «Actualizada el…»', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $section = MenuSection::factory()->for($restaurant)->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditMenuSection::class, ['record' => $section->getRouteKey()])
        ->callAction(DeleteAction::class)
        ->assertRedirect();

    expect(MenuSection::query()->whereKey($section->id)->exists())->toBeFalse()
        ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
});
