<?php

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\PublishRestaurant;
use App\Actions\Restaurants\RestaurantStatusRules;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantRemovalRequest;
use App\Models\RestaurantSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * Las reglas del estado de una ficha (#19, ADR 0027), en un solo lugar: las
 * usan publicar, aprobar un reclamo y la ficha de administración.
 */
function statusRulesOsmDraft(array $source = []): Restaurant
{
    $restaurant = Restaurant::factory()->hidden()->create(['verified_at' => now()]);
    DB::table('restaurant_sources')->insert([
        'restaurant_id' => $restaurant->id, 'source' => RestaurantSource::OPENSTREETMAP, 'element_type' => 'node',
        'element_id' => $restaurant->id, 'element_kind' => 'amenity=cafe', 'fetched_at' => now(),
        'imported_hash' => str_repeat('a', 64), ...$source,
    ]);

    return $restaurant;
}

/** Una ficha oculta, verificada, cuyo retiro se aprobó. */
function statusRulesRemoved(): Restaurant
{
    $restaurant = Restaurant::factory()->hidden()->create(['verified_at' => now()]);
    RestaurantRemovalRequest::factory()->approved()->create(['restaurant_id' => $restaurant->id]);

    return $restaurant;
}

test('las transiciones prohibidas se rechazan con su motivo', function (Closure $make, RestaurantStatus $target, bool $verified, string $reason) {
    $restaurant = $make();

    expect(fn () => RestaurantStatusRules::assert($restaurant, $target, $verified))
        ->toThrow(ActionRefused::class, "Acción rechazada: {$reason}.");
})->with([
    'reclamada sin dueño' => [fn () => Restaurant::factory()->create(), RestaurantStatus::Claimed, true, ActionRefused::CLAIMED_NEEDS_OWNER],
    'sin reclamar con dueño' => [fn () => tap(Restaurant::factory()->claimed()->create(), fn (Restaurant $r) => panelMember($r)), RestaurantStatus::Unclaimed, true, ActionRefused::UNCLAIMED_HAS_OWNER],
    'publicar una oculta sin verificar' => [fn () => Restaurant::factory()->hidden()->create(['verified_at' => null]), RestaurantStatus::Unclaimed, false, ActionRefused::NOT_VERIFIED],
    'publicar una nueva sin verificar' => [fn () => new Restaurant, RestaurantStatus::Unclaimed, false, ActionRefused::NOT_VERIFIED],
    'publicar un borrador descartado' => [fn () => statusRulesOsmDraft(['dismissed_at' => now()]), RestaurantStatus::Unclaimed, true, ActionRefused::DISMISSED],
    'publicar una ficha retirada' => [fn () => statusRulesRemoved(), RestaurantStatus::Unclaimed, true, ActionRefused::REMOVED],
]);

test('lo permitido pasa: ocultar, publicar verificada, reclamar con dueño y una publicada que ya estaba sigue sin verificar', function (Closure $make, RestaurantStatus $target, bool $verified) {
    RestaurantStatusRules::assert($make(), $target, $verified);

    expect(true)->toBeTrue();
})->with([
    'ocultar una retirada' => [fn () => statusRulesRemoved(), RestaurantStatus::Hidden, false],
    'publicar una oculta verificada' => [fn () => Restaurant::factory()->hidden()->create(), RestaurantStatus::Unclaimed, true],
    'reclamada con dueño' => [fn () => tap(Restaurant::factory()->create(), fn (Restaurant $r) => panelMember($r)), RestaurantStatus::Claimed, false],
    'publicada que sigue publicada' => [fn () => Restaurant::factory()->create(['verified_at' => null]), RestaurantStatus::Unclaimed, false],
]);

test('publicar (o «mostrar») una ficha cuyo retiro se aprobó se rechaza y sigue oculta', function () {
    $restaurant = statusRulesRemoved();

    expect(fn () => app(PublishRestaurant::class)->handle($restaurant, verifiedNow: true))
        ->toThrow(ActionRefused::class, ActionRefused::REMOVED);
    expect($restaurant->fresh()?->status)->toBe(RestaurantStatus::Hidden);
});
