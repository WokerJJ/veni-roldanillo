<?php

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\Restaurant;
use App\Support\BusinessDay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

/*
| «Agotado hoy» de platos e ingredientes (ADR 0018, 0033 y 0035): una sola
| regla en App\Models\Concerns\SoldOutToday. Vale hasta la medianoche de
| Colombia, incluida, no la del servidor (UTC).
*/

dataset('agotables', [
    'plato' => [fn (Restaurant $restaurant): Dish => panelDish($restaurant)],
    'ingrediente' => [fn (Restaurant $restaurant): Ingredient => Ingredient::factory()->for($restaurant)->create()],
]);

test('vence a la medianoche de Colombia, no a la del servidor', function (Closure $make) {
    // 22:30 del 4 en Bogotá son las 03:30 del 5 en UTC.
    $this->travelTo(Carbon::parse('2026-11-04 22:30:00', BusinessDay::TIME_ZONE));
    /** @var Dish|Ingredient $record */
    $record = $make(Restaurant::factory()->claimed()->create());
    $query = fn () => $record->newQuery()->whereKey($record->getKey());

    $record->setSoldOutToday(true);

    expect($record->fresh()?->sold_out_until?->toDateString())->toBe('2026-11-04')
        ->and($record->fresh()?->isSoldOutToday())->toBeTrue()
        ->and($query()->soldOutToday()->exists())->toBeTrue()
        ->and($query()->availableToday()->exists())->toBeFalse();

    $this->travelTo(Carbon::parse('2026-11-04 23:59:59', BusinessDay::TIME_ZONE));
    expect($record->fresh()?->isSoldOutToday())->toBeTrue()
        ->and($query()->soldOutToday()->exists())->toBeTrue();

    $this->travelTo(Carbon::parse('2026-11-05 00:00:00', BusinessDay::TIME_ZONE));
    expect($record->fresh()?->isSoldOutToday())->toBeFalse()
        ->and($query()->soldOutToday()->exists())->toBeFalse()
        ->and($query()->availableToday()->exists())->toBeTrue();
})->with('agotables');

test('«Ya hay» lo deja disponible, y sin fecha también está disponible', function (Closure $make) {
    /** @var Dish|Ingredient $record */
    $record = $make(Restaurant::factory()->claimed()->create());
    $query = fn () => $record->newQuery()->whereKey($record->getKey());

    expect($record->isSoldOutToday())->toBeFalse()
        ->and($query()->availableToday()->exists())->toBeTrue();

    $record->setSoldOutToday(true);
    $record->setSoldOutToday(false);

    expect($record->fresh()?->sold_out_until)->toBeNull()
        ->and($query()->availableToday()->exists())->toBeTrue()
        ->and($query()->soldOutToday()->exists())->toBeFalse();
})->with('agotables');
