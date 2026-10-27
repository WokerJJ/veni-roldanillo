<?php

use App\Filament\Owner\Resources\DeliveryZones\Pages\CreateDeliveryZone;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\OpeningHours\Pages\EditOpeningHour;
use App\Filament\Owner\Resources\Promotions\Pages\CreatePromotion;
use App\Filament\Owner\Resources\SpecialHours\Pages\CreateSpecialHour;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\OpeningHour;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use Filament\Actions\DeleteAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Horarios, horarios especiales, promociones, zonas y platos desde el panel
 * del dueño (#18, ADR 0025): lo que guarda cada uno y que ningún id ajeno se
 * abre cambiando la dirección.
 */
test('editar un horario mueve «Actualizada el…»', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $hour = OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditOpeningHour::class, ['record' => $hour->getRouteKey()])
        ->fillForm(['closes_at' => '16:00'])
        ->call('save')
        ->assertHasNoFormErrors();

    expect(substr((string) $hour->refresh()->closes_at, 0, 5))->toBe('16:00')
        ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
});

test('un horario especial cerrado se guarda sin horas aunque lleguen', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreateSpecialHour::class)
        ->fillForm(['on_date' => now()->addDays(3)->toDateString(), 'closed' => true])
        ->set('data.opens_at', '10:00')
        ->set('data.closes_at', '14:00')
        ->call('create')
        ->assertHasNoFormErrors();

    $special = SpecialHour::query()->where('restaurant_id', $restaurant->id)->sole();
    expect($special->closed)->toBeTrue()
        ->and($special->opens_at)->toBeNull()
        ->and($special->closes_at)->toBeNull();
});

test('una zona con un barrio que ya tiene se avisa en el barrio, sin error 500', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $neighborhood = Neighborhood::factory()->create();
    DeliveryZone::factory()->for($restaurant)->create(['neighborhood_id' => $neighborhood->id]);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreateDeliveryZone::class)
        ->fillForm(['neighborhood_id' => $neighborhood->id, 'fee' => 2000])
        ->call('create')
        ->assertHasFormErrors(['neighborhood_id']);

    expect($restaurant->deliveryZones()->count())->toBe(1);
});

test('una promoción que termina antes de empezar responde con error y no se guarda', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreatePromotion::class)
        ->fillForm(['title_es' => 'Dos por uno', 'starts_at' => '2026-11-10 12:00', 'ends_at' => '2026-11-09 12:00'])
        ->call('create')
        ->assertHasFormErrors(['ends_at']);

    expect(Promotion::query()->where('restaurant_id', $restaurant->id)->exists())->toBeFalse();
});

test('borrar un plato mueve «Actualizada el…»', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
    $dish = panelDish($restaurant);
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->callAction(DeleteAction::class);

    expect(Dish::query()->whereKey($dish->id)->exists())->toBeFalse()
        ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
});

test('un dueño no abre un registro ajeno cambiando el id en la dirección de su restaurante (IDOR)', function (string $slug, Closure $make) {
    $mine = Restaurant::factory()->claimed()->create();
    $owner = panelMember($mine);
    $foreign = $make(Restaurant::factory()->claimed()->create());

    $this->actingAs($owner)->get("/panel/{$mine->slug}/{$slug}/{$foreign->getKey()}/edit")->assertNotFound();
})->with([
    'secciones' => ['menu-sections', fn (Restaurant $r) => MenuSection::factory()->for($r)->create()],
    'platos' => ['dishes', fn (Restaurant $r) => panelDish($r)],
    'horarios' => ['opening-hours', fn (Restaurant $r) => OpeningHour::factory()->for($r)->create()],
    'horarios especiales' => ['special-hours', fn (Restaurant $r) => SpecialHour::factory()->for($r)->create()],
    'promociones' => ['promotions', fn (Restaurant $r) => Promotion::factory()->for($r)->create()],
    'zonas' => ['delivery-zones', fn (Restaurant $r) => DeliveryZone::factory()->for($r)->create()],
]);
