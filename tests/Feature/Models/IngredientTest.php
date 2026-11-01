<?php

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\MenuSection;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use App\Support\BusinessDay;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

/**
 * Ingredientes agotados hoy con reemplazo (#112, ADR 0033): las reglas que
 * guarda la base y lo que cambia un ingrediente esencial agotado.
 */
function ingredientDish(Restaurant $restaurant): Dish
{
    return Dish::factory()->for($restaurant)->for(MenuSection::factory()->for($restaurant))->create(['available' => true, 'sold_out_until' => null]);
}

test('un ingrediente no se reemplaza por sí mismo', function () {
    $tomate = Ingredient::factory()->create();

    expect(fn () => $tomate->update(['substitute_ingredient_id' => $tomate->id]))
        ->toThrow(QueryException::class, 'ingredients_substitute_valid');
});

test('el reemplazo es del mismo restaurante', function () {
    $tomate = Ingredient::factory()->create();
    $ajeno = Ingredient::factory()->create();

    expect(fn () => $tomate->update(['substitute_ingredient_id' => $ajeno->id]))
        ->toThrow(QueryException::class, 'ingredients_substitute_same_restaurant');
});

test('el recargo del reemplazo no es negativo', function () {
    $tomate = Ingredient::factory()->create();

    expect(fn () => $tomate->update(['substitute_price_delta' => -1]))
        ->toThrow(QueryException::class, 'ingredients_substitute_valid');
});

test('no hay dos ingredientes con el mismo nombre en un restaurante, sin importar mayúsculas', function () {
    $restaurant = Restaurant::factory()->create();
    $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    // En otro restaurante, sí.
    expect(Restaurant::factory()->create()->ingredients()->create(['name_es' => 'Tomate'])->exists)->toBeTrue();

    expect(fn () => $restaurant->ingredients()->create(['name_es' => 'TOMATE']))
        ->toThrow(QueryException::class, 'ingredients_restaurant_name_unique');
});

test('un plato solo lleva ingredientes de su restaurante', function () {
    $restaurant = Restaurant::factory()->create();
    $dish = ingredientDish($restaurant);
    $ajeno = Ingredient::factory()->create();

    expect(fn () => $dish->dishIngredients()->create(['ingredient_id' => $ajeno->id]))
        ->toThrow(QueryException::class, 'dish_ingredient_ingredient_id_restaurant_id_foreign');
});

test('una opción solo apunta a un ingrediente de su restaurante', function () {
    $restaurant = Restaurant::factory()->create();
    $group = OptionGroup::factory()->removal()->for(ingredientDish($restaurant))->create();
    $propio = $restaurant->ingredients()->create(['name_es' => 'Cebolla']);
    $ajeno = Ingredient::factory()->create();

    $option = Option::factory()->for($group)->create(['ingredient_id' => $propio->id]);
    expect($option->ingredient_id)->toBe($propio->id);

    expect(fn () => $option->update(['ingredient_id' => $ajeno->id]))
        ->toThrow(QueryException::class, 'options_ingredient_same_restaurant');
});

test('borrar un ingrediente lo quita de los platos, deja las opciones sin él y a quien lo tenía de reemplazo, sin reemplazo', function () {
    $restaurant = Restaurant::factory()->create();
    $dish = ingredientDish($restaurant);
    $pepino = $restaurant->ingredients()->create(['name_es' => 'Pepino']);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate', 'substitute_ingredient_id' => $pepino->id, 'substitute_price_delta' => 500]);
    $dish->dishIngredients()->create(['ingredient_id' => $pepino->id]);
    $option = Option::factory()->for(OptionGroup::factory()->for($dish))->create(['ingredient_id' => $pepino->id]);

    $pepino->delete();

    expect($dish->dishIngredients()->count())->toBe(0)
        ->and($option->refresh()->ingredient_id)->toBeNull()
        ->and($tomate->refresh()->substitute_ingredient_id)->toBeNull()
        ->and($tomate->restaurant_id)->toBe($restaurant->id);
});

test('borrar el restaurante se lleva sus ingredientes y sus vínculos', function () {
    $restaurant = Restaurant::factory()->create();
    $dish = ingredientDish($restaurant);
    $pepino = $restaurant->ingredients()->create(['name_es' => 'Pepino']);
    $restaurant->ingredients()->create(['name_es' => 'Tomate', 'substitute_ingredient_id' => $pepino->id]);
    $dish->dishIngredients()->create(['ingredient_id' => $pepino->id, 'essential' => true]);

    $restaurant->delete();

    expect(Ingredient::query()->count())->toBe(0);
});

test('agotado hoy vence a la medianoche de Colombia', function () {
    $this->travelTo(Carbon::parse('2026-11-01 23:30:00', 'America/Bogota'));
    $tomate = Ingredient::factory()->create();

    $tomate->setSoldOutToday(true);
    expect($tomate->refresh()->isSoldOutToday())->toBeTrue()
        ->and($tomate->sold_out_until?->toDateString())->toBe(BusinessDay::today()->toDateString());

    $this->travel(1)->hours();
    expect($tomate->refresh()->isSoldOutToday())->toBeFalse();
});

test('un ingrediente esencial agotado hoy deja el plato sin pedir; uno no esencial, no', function () {
    $restaurant = Restaurant::factory()->create();
    $dish = ingredientDish($restaurant);
    $arroz = $restaurant->ingredients()->create(['name_es' => 'Arroz']);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    $dish->dishIngredients()->create(['ingredient_id' => $arroz->id, 'essential' => true]);
    $dish->dishIngredients()->create(['ingredient_id' => $tomate->id, 'essential' => false]);

    expect($dish->orderableToday())->toBeTrue();

    $tomate->setSoldOutToday(true);
    expect($dish->refresh()->orderableToday())->toBeTrue();

    $arroz->setSoldOutToday(true);
    expect($dish->refresh()->orderableToday())->toBeFalse()
        // Lo mismo en una sola consulta para muchos platos (la búsqueda por plato).
        ->and(Dish::query()->withEssentialSoldOut()->findOrFail($dish->id)->orderableToday())->toBeFalse();

    // Mañana vuelve solo.
    $this->travel(1)->days();
    expect(Dish::query()->withEssentialSoldOut()->findOrFail($dish->id)->orderableToday())->toBeTrue();
});
