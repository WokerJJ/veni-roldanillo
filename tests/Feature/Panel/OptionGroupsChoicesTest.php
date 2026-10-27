<?php

use App\Models\OptionGroup;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * El mínimo y el máximo de un grupo no pasan de la cantidad de opciones que
 * tiene (#18, ADR 0025): «elegí 3» con dos opciones no se puede cumplir.
 * Cuentan todas las opciones del grupo, también las que hoy no están
 * disponibles; si con las disponibles no alcanza, la ficha marca el plato
 * «No disponible hoy».
 */
function groupWithTwoOptions(array $choices): array
{
    return [
        'kind' => 'choice', 'name_es' => 'Proteína', 'position' => 0, ...$choices,
        'options' => [
            ['name_es' => 'Pollo', 'price_delta' => 0, 'available' => true],
            ['name_es' => 'Res', 'price_delta' => 2000, 'available' => false],
        ],
    ];
}

test('el mínimo y el máximo no pasan de la cantidad de opciones', function (array $choices, string $field) {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    actInPanel(panelMember($restaurant), $restaurant);

    groupManager($dish)
        ->callTableAction('create', data: groupWithTwoOptions($choices))
        ->assertHasTableActionErrors([$field]);

    expect(OptionGroup::query()->count())->toBe(0);
})->with([
    'mínimo' => [['min_choices' => 3, 'max_choices' => 3], 'min_choices'],
    'máximo' => [['min_choices' => 0, 'max_choices' => 3], 'max_choices'],
]);

test('con tantas opciones como el máximo, se guarda (cuentan también las no disponibles)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    actInPanel(panelMember($restaurant), $restaurant);

    groupManager($dish)
        ->callTableAction('create', data: groupWithTwoOptions(['min_choices' => 2, 'max_choices' => 2]))
        ->assertHasNoTableActionErrors();

    expect($dish->optionGroups()->sole()->max_choices)->toBe(2);
});
