<?php

use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\Ingredients\IngredientResource;
use App\Filament\Owner\Resources\Ingredients\Pages\CreateIngredient;
use App\Filament\Owner\Resources\Ingredients\Pages\EditIngredient;
use App\Filament\Owner\Resources\Ingredients\Pages\ListIngredients;
use App\Models\Ingredient;
use App\Models\Option;
use App\Models\Restaurant;
use App\Support\BusinessDay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Ingredientes desde el panel del dueño (#112, ADR 0033): la lista común,
 * «agotado hoy», el reemplazo, qué lleva cada plato y qué opción es un
 * ingrediente. Un dueño solo toca los suyos.
 */
test('crea un ingrediente agotado hoy con reemplazo y recargo', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $pepino = $restaurant->ingredients()->create(['name_es' => 'Pepino']);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreateIngredient::class)
        ->fillForm(['name_es' => 'Tomate', 'name_en' => 'Tomato', 'sold_out_today' => true, 'substitute_ingredient_id' => $pepino->id, 'substitute_price_delta' => 500])
        ->call('create')
        ->assertHasNoFormErrors();

    $tomate = Ingredient::query()->where('name_es', 'Tomate')->sole();
    expect($tomate->restaurant_id)->toBe($restaurant->id)
        ->and($tomate->sold_out_until?->toDateString())->toBe(BusinessDay::today()->toDateString())
        ->and($tomate->substitute_ingredient_id)->toBe($pepino->id)
        ->and($tomate->substitute_price_delta)->toBe(500)
        ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
});

test('un reemplazo de otro restaurante no se acepta', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $ajeno = Ingredient::factory()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreateIngredient::class)
        ->fillForm(['name_es' => 'Tomate', 'substitute_ingredient_id' => $ajeno->id])
        ->call('create')
        ->assertHasFormErrors(['substitute_ingredient_id']);

    expect($restaurant->ingredients()->count())->toBe(0);
});

test('sin reemplazo el recargo vuelve a cero', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $pepino = $restaurant->ingredients()->create(['name_es' => 'Pepino']);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate', 'substitute_ingredient_id' => $pepino->id, 'substitute_price_delta' => 500]);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditIngredient::class, ['record' => $tomate->getRouteKey()])
        ->fillForm(['substitute_ingredient_id' => null])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($tomate->refresh()->substitute_ingredient_id)->toBeNull()
        ->and($tomate->substitute_price_delta)->toBe(0);
});

test('el interruptor de la lista marca y desmarca «agotado hoy»', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(ListIngredients::class)->callTableAction('toggleSoldOut', $tomate);
    expect($tomate->refresh()->isSoldOutToday())->toBeTrue();

    Livewire::test(ListIngredients::class)->callTableAction('toggleSoldOut', $tomate);
    expect($tomate->refresh()->isSoldOutToday())->toBeFalse();
});

test('la lista no muestra los de otro restaurante y su edición no se abre', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $propio = $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    $ajeno = Ingredient::factory()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(ListIngredients::class)
        ->assertCanSeeTableRecords([$propio])
        ->assertCanNotSeeTableRecords([$ajeno]);

    $this->get("/panel/{$restaurant->slug}/ingredients/{$ajeno->getKey()}/edit")->assertNotFound();
    $this->get("/panel/{$restaurant->slug}/ingredients/{$propio->getKey()}/edit")->assertOk();
});

test('antes de borrar avisa en cuántos platos y opciones está', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate']);

    expect(IngredientResource::usage($tomate))->toBe(__('panel.ingredients.not_in_use'));

    $dish->dishIngredients()->create(['ingredient_id' => $tomate->id]);

    expect(IngredientResource::usage($tomate))->toBe(__('panel.ingredients.in_use', ['dishes' => 1, 'options' => 0]));
});

test('el plato guarda sus ingredientes, esenciales o no, solo del restaurante', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    $arroz = $restaurant->ingredients()->create(['name_es' => 'Arroz']);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    $ajeno = Ingredient::factory()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->set('data.dishIngredients', [
            'a' => ['ingredient_id' => $arroz->id, 'essential' => true],
            'b' => ['ingredient_id' => $tomate->id, 'essential' => false],
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($dish->dishIngredients()->pluck('essential', 'ingredient_id')->all())->toBe([$arroz->id => true, $tomate->id => false])
        ->and($dish->dishIngredients()->value('restaurant_id'))->toBe($restaurant->id);

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->set('data.dishIngredients', ['c' => ['ingredient_id' => $ajeno->id, 'essential' => false]])
        ->call('save')
        ->assertHasFormErrors(['dishIngredients.c.ingredient_id']);

    expect($dish->dishIngredients()->count())->toBe(2);
});

test('una opción se vincula a un ingrediente propio y no a uno ajeno', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    $cebolla = $restaurant->ingredients()->create(['name_es' => 'Cebolla']);
    $ajeno = Ingredient::factory()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    groupManager($dish)
        ->callTableAction('create', data: [
            'kind' => 'removal', 'name_es' => 'Quitar', 'min_choices' => 0, 'max_choices' => 1, 'position' => 0,
            'options' => [['name_es' => 'Cebolla', 'price_delta' => 0, 'available' => true, 'ingredient_id' => $ajeno->id]],
        ])
        ->assertHasTableActionErrors();

    expect(Option::query()->count())->toBe(0);

    groupManager($dish)
        ->callTableAction('create', data: [
            'kind' => 'removal', 'name_es' => 'Quitar', 'min_choices' => 0, 'max_choices' => 1, 'position' => 0,
            'options' => [['name_es' => 'Cebolla', 'price_delta' => 0, 'available' => true, 'ingredient_id' => $cebolla->id]],
        ])
        ->assertHasNoTableActionErrors();

    expect(Option::query()->sole()->ingredient_id)->toBe($cebolla->id);
});
