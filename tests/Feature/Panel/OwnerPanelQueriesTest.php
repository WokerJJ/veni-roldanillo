<?php

use App\Enums\OptionGroupKind;
use App\Filament\Owner\Resources\Dishes\Pages\ListDishes;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Las tablas del panel autorizan cada fila (editar, «agotado hoy», borrar)
 * sin una consulta por fila (#18, ADR 0025): con más filas en la página, las
 * mismas consultas.
 */
function countQueries(Closure $render): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    $render();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    return $queries;
}

test('la lista de platos hace las mismas consultas con 5 que con 30 platos', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $section = MenuSection::factory()->for($restaurant)->create();
    $addDishes = fn (int $count) => Dish::factory()->count($count)->for($restaurant)->create(['menu_section_id' => $section->id]);
    actInPanel(panelMember($restaurant), $restaurant);

    // Una vuelta antes de medir: lo que se consulta una sola vez por petición
    // (la pertenencia al restaurante) no cuenta como fila.
    Livewire::test(ListDishes::class);

    $addDishes(5);
    $withFive = countQueries(fn () => Livewire::test(ListDishes::class)->set('tableRecordsPerPage', 50)->assertCountTableRecords(5));
    $addDishes(25);
    $withThirty = countQueries(fn () => Livewire::test(ListDishes::class)->set('tableRecordsPerPage', 50)->assertCountTableRecords(30));

    expect($withThirty)->toBe($withFive);
});

test('los grupos de un plato hacen las mismas consultas con 2 que con 8 grupos', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    $addGroups = function (int $count) use ($dish): void {
        $start = $dish->optionGroups()->count();
        foreach (range($start + 1, $start + $count) as $i) {
            $dish->optionGroups()->create(['kind' => OptionGroupKind::Choice, 'name_es' => "G{$i}", 'required' => false, 'min_choices' => 0, 'max_choices' => 1, 'position' => $i]);
        }
    };
    actInPanel(panelMember($restaurant), $restaurant);

    groupManager($dish);

    $addGroups(2);
    $withTwo = countQueries(fn () => groupManager($dish)->assertCountTableRecords(2));
    $addGroups(6);
    $withEight = countQueries(fn () => groupManager($dish)->assertCountTableRecords(8));

    expect($withEight)->toBe($withTwo);
});
