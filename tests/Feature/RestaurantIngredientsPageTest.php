<?php

use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * La ficha publica los ingredientes agotados hoy (#112, ADR 0033) por lista
 * blanca: nombre, si es esencial, si lo lleva el plato, hasta cuándo no hay
 * y el reemplazo con su recargo. Nada del resto de la lista.
 */
beforeEach(function () {
    $this->withoutVite();
    $this->travelTo(Carbon::parse('2026-11-01 12:00:00', 'America/Bogota'));
});

/**
 * @return array{Restaurant, Dish}
 */
function ingredientsRestaurant(): array
{
    $restaurant = Restaurant::factory()->create(['slug' => 'con-ingredientes']);
    $dish = Dish::factory()->for($restaurant)->for(MenuSection::factory()->for($restaurant))->create(['name_es' => 'Bandeja', 'available' => true, 'sold_out_until' => null]);

    return [$restaurant, $dish];
}

/** @return list<array<string, mixed>> */
function profileDishes(Restaurant $restaurant): array
{
    $menu = test()->get("/restaurants/{$restaurant->slug}")->assertOk()->inertiaProps('restaurant.menu');

    return $menu[0]['dishes'];
}

test('publica los agotados de hoy que tocan al plato, con su efecto y la posición en cada opción', function () {
    [$restaurant, $dish] = ingredientsRestaurant();
    $pepino = $restaurant->ingredients()->create(['name_es' => 'Pepino', 'name_en' => 'Cucumber']);
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate', 'name_en' => 'Tomato', 'sold_out_until' => '2026-11-01', 'substitute_ingredient_id' => $pepino->id, 'substitute_price_delta' => 500]);
    $frijoles = $restaurant->ingredients()->create(['name_es' => 'Fríjoles', 'sold_out_until' => '2026-11-01']);
    $aguacate = $restaurant->ingredients()->create(['name_es' => 'Aguacate', 'sold_out_until' => '2026-11-01']);
    // Ayer: ya no cuenta y no se publica.
    $cebolla = $restaurant->ingredients()->create(['name_es' => 'Cebolla', 'sold_out_until' => '2026-10-31']);
    // De otro plato: no toca a este.
    $restaurant->ingredients()->create(['name_es' => 'Maíz', 'sold_out_until' => '2026-11-01']);
    $dish->dishIngredients()->create(['ingredient_id' => $frijoles->id, 'essential' => true]);
    $dish->dishIngredients()->create(['ingredient_id' => $tomate->id]);
    $dish->dishIngredients()->create(['ingredient_id' => $cebolla->id]);
    $extras = OptionGroup::factory()->for($dish)->create(['name_es' => 'Adiciones', 'max_choices' => 2]);
    Option::factory()->for($extras)->create(['name_es' => 'Huevo', 'position' => 0, 'ingredient_id' => null]);
    Option::factory()->for($extras)->create(['name_es' => 'Aguacate', 'position' => 1, 'available' => true, 'ingredient_id' => $aguacate->id]);
    $removal = OptionGroup::factory()->removal()->for($dish)->create(['name_es' => 'Quitar', 'position' => 1]);
    Option::factory()->for($removal)->create(['name_es' => 'Tomate', 'position' => 0, 'available' => true, 'ingredient_id' => $tomate->id]);
    Option::factory()->for($removal)->create(['name_es' => 'Cebolla', 'position' => 1, 'available' => true, 'ingredient_id' => $cebolla->id]);

    $published = profileDishes($restaurant)[0];

    expect($published['ingredients'])->toBe([
        ['name' => 'Aguacate', 'essential' => false, 'in_dish' => false, 'sold_out_until' => '2026-11-01', 'substitute' => null],
        ['name' => 'Fríjoles', 'essential' => true, 'in_dish' => true, 'sold_out_until' => '2026-11-01', 'substitute' => null],
        ['name' => 'Tomate', 'essential' => false, 'in_dish' => true, 'sold_out_until' => '2026-11-01', 'substitute' => ['name' => 'Pepino', 'price' => 500, 'sold_out_until' => null]],
    ])
        // Los chips (ADR 0036): lo que lleva, en el orden del dueño, con su
        // lugar en la lista de agotados; la cebolla de ayer ya no apunta a nada.
        ->and($published['contains'])->toBe([
            ['name' => 'Fríjoles', 'ingredient' => 1],
            ['name' => 'Tomate', 'ingredient' => 2],
            ['name' => 'Cebolla', 'ingredient' => null],
        ])
        ->and(array_column($published['groups'][0]['options'], 'ingredient'))->toBe([null, 0])
        ->and(array_column($published['groups'][1]['options'], 'ingredient'))->toBe([2, null]);
});

test('sin agotados, cada plato lleva una lista vacía y las opciones, null', function () {
    [$restaurant, $dish] = ingredientsRestaurant();
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate']);
    $dish->dishIngredients()->create(['ingredient_id' => $tomate->id, 'essential' => true]);
    Option::factory()->for(OptionGroup::factory()->removal()->for($dish))->create(['available' => true, 'ingredient_id' => $tomate->id]);

    $published = profileDishes($restaurant)[0];

    expect($published['ingredients'])->toBe([])
        ->and($published['contains'])->toBe([['name' => 'Tomate', 'ingredient' => null]])
        ->and($published['groups'][0]['options'][0]['ingredient'])->toBeNull();
});

test('los chips van en el idioma de la ficha, con el nombre en español del que sale el ícono (BUG-025)', function () {
    [$restaurant, $dish] = ingredientsRestaurant();
    $tomate = $restaurant->ingredients()->create(['name_es' => 'Tomate', 'name_en' => 'Tomato']);
    $ajo = $restaurant->ingredients()->create(['name_es' => 'Ajo', 'name_en' => null]);
    // De otro plato del mismo restaurante: no es chip de este.
    $restaurant->ingredients()->create(['name_es' => 'Maíz']);
    $dish->dishIngredients()->create(['ingredient_id' => $tomate->id]);
    $dish->dishIngredients()->create(['ingredient_id' => $ajo->id, 'essential' => true]);
    $dish->update(['name_es' => 'Sancocho de gallina', 'name_en' => 'Hen soup']);

    $menu = $this->get("/restaurants/{$restaurant->slug}?lang=en")->assertOk()->inertiaProps('restaurant.menu');

    // El ícono no depende del idioma (BUG-025): el dispositivo lo busca por
    // el nombre en español, el de los archivos de resources/icons/veni y el
    // de los platos típicos. En español no viaja dos veces.
    expect($menu[0]['dishes'][0]['contains'])->toBe([
        ['name' => 'Tomato', 'name_es' => 'Tomate', 'ingredient' => null],
        // Sin nombre en inglés, el de español, que ya dice el ícono.
        ['name' => 'Ajo', 'ingredient' => null],
    ])
        ->and($menu[0]['dishes'][0]['name'])->toBe('Hen soup')
        ->and($menu[0]['dishes'][0]['name_es'])->toBe('Sancocho de gallina');
});

test('los agotados suman una consulta fija, el reemplazo, tenga el menú los ingredientes que tenga (AUD-027)', function () {
    $queries = function (Restaurant $restaurant): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->get("/restaurants/{$restaurant->slug}")->assertOk();
        DB::disableQueryLog();

        return count(DB::getQueryLog());
    };

    $seed = function (string $slug, int $size): Restaurant {
        $restaurant = Restaurant::factory()->create(['slug' => $slug]);
        $section = MenuSection::factory()->for($restaurant)->create();

        foreach (range(1, $size) as $i) {
            $dish = Dish::factory()->for($restaurant)->for($section)->create(['available' => true]);
            $substitute = $restaurant->ingredients()->create(['name_es' => "Reemplazo {$i}"]);
            $ingredient = $restaurant->ingredients()->create(['name_es' => "Ingrediente {$i}", 'sold_out_until' => '2026-11-01', 'substitute_ingredient_id' => $substitute->id]);
            $dish->dishIngredients()->create(['ingredient_id' => $ingredient->id]);
        }

        return $restaurant;
    };

    $empty = Restaurant::factory()->create(['slug' => 'sin-agotados']);
    Dish::factory()->for($empty)->for(MenuSection::factory()->for($empty))->create(['available' => true]);
    $short = $seed('corto', 1);
    $long = $seed('largo', 6);

    // Qué platos los llevan, y si son esenciales, sale del pivote de los
    // ingredientes de cada plato (los chips), que ya se consultó.
    expect($queries($short))->toBe($queries($long))
        ->and($queries($short))->toBe($queries($empty) + 1);
});
