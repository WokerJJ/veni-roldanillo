<?php

use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Las bebidas alcohólicas con aviso de mayores de 18 (ADR 0050): el plato lleva
 * la marca, la ficha pública la manda y el dueño la puede cambiar.
 */
test('la ficha pública manda la marca de alcohol de cada plato, y solo la de los platos publicados', function () {
    $this->withoutVite();
    $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba-prueba']);
    $section = MenuSection::factory()->create(['restaurant_id' => $restaurant->id, 'name_es' => 'Cervezas']);
    Dish::factory()->create(['restaurant_id' => $restaurant->id, 'menu_section_id' => $section->id, 'name_es' => 'Cerveza de prueba', 'is_alcohol' => true, 'position' => 0]);
    Dish::factory()->create(['restaurant_id' => $restaurant->id, 'menu_section_id' => $section->id, 'name_es' => 'Malta de prueba', 'position' => 1]);

    $dishes = collect($this->get('/restaurants/la-ceiba-prueba')->assertOk()->inertiaProps('restaurant.menu.0.dishes'))->keyBy('name');

    expect($dishes['Cerveza de prueba']['alcohol'])->toBeTrue()
        ->and($dishes['Malta de prueba']['alcohol'])->toBeFalse();
});

test('un plato nuevo no es alcohólico hasta que alguien lo marca', function () {
    expect(Dish::factory()->create()->refresh()->is_alcohol)->toBeFalse();
});

test('el dueño marca y desmarca una bebida alcohólica en su plato', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['is_alcohol' => true])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($dish->refresh()->is_alcohol)->toBeTrue();

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['is_alcohol' => false])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($dish->refresh()->is_alcohol)->toBeFalse();
});

test('el dueño no puede marcar un plato de otro restaurante', function () {
    $mine = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();
    $theirs = panelDish($other);
    actInPanel(panelMember($mine), $mine);

    $this->get("/panel/{$mine->slug}/dishes/{$theirs->getRouteKey()}/edit")->assertNotFound();
    expect($theirs->refresh()->is_alcohol)->toBeFalse();
});
