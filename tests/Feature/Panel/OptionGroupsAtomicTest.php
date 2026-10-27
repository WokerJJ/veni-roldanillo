<?php

use App\Enums\OptionGroupKind;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Un grupo de opciones y sus opciones se guardan juntos o no se guardan
 * (#18, ADR 0025). Para que la base rechace una opción que ya pasó la
 * validación del formulario, la prueba le cambia el precio justo antes de
 * insertarla: el CHECK options_price_delta_non_negative la rechaza de verdad.
 */
function rejectOptionsInDatabase(): void
{
    Option::saving(function (Option $option): void {
        $option->price_delta = -1;
    });
}

test('si la base rechaza una opción al crear, no queda el grupo a medias y se avisa', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $dish = panelDish($restaurant);
    actInPanel(panelMember($restaurant), $restaurant);
    rejectOptionsInDatabase();

    groupManager($dish)
        ->callTableAction('create', data: [
            'kind' => 'choice', 'name_es' => 'Proteína', 'min_choices' => 1, 'max_choices' => 1, 'position' => 0,
            'options' => [['name_es' => 'Pollo', 'price_delta' => 0, 'available' => true]],
        ])
        ->assertHasTableActionErrors(['name_es']);

    expect(OptionGroup::query()->count())->toBe(0)
        ->and(Option::query()->count())->toBe(0)
        ->and($restaurant->refresh()->updated_by_owner_at)->toBeNull();
});

test('si la base rechaza una opción al editar, el grupo queda como estaba', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $dish = panelDish($restaurant);
    $group = $dish->optionGroups()->create([
        'kind' => OptionGroupKind::Choice, 'name_es' => 'Proteína', 'required' => true,
        'min_choices' => 1, 'max_choices' => 1, 'position' => 0,
    ]);
    $group->options()->create(['name_es' => 'Pollo', 'price_delta' => 0, 'position' => 0]);
    actInPanel(panelMember($restaurant), $restaurant);
    rejectOptionsInDatabase();

    groupManager($dish)
        ->callTableAction('edit', $group, data: [
            'name_es' => 'Otra',
            'options' => [['name_es' => 'Res', 'price_delta' => 0, 'available' => true]],
        ])
        ->assertHasTableActionErrors(['name_es']);

    expect($group->refresh()->name_es)->toBe('Proteína')
        ->and($group->options()->pluck('name_es')->all())->toBe(['Pollo']);
});
