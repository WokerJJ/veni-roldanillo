<?php

use App\Models\DeliveryZone;
use App\Models\MenuSection;
use App\Models\OpeningHour;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Autorización estricta (#18, ADR 0025): si a una Policy le falta un método
 * que Filament pregunta, el panel falla en vez de permitir. Un dueño recorre
 * todas las páginas para comprobar que no falta ninguno.
 */
test('el panel del dueño usa la autorización estricta', function () {
    expect(Filament::getPanel('owner')->isAuthorizationStrict())->toBeTrue();
});

test('el dueño recorre la lista, el alta y la edición de cada recurso', function (string $slug, Closure $make) {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $record = $make($restaurant);
    $base = "/panel/{$restaurant->slug}/{$slug}";

    $this->actingAs($owner)->get($base)->assertOk();
    $this->actingAs($owner)->get("{$base}/create")->assertOk();
    $this->actingAs($owner)->get("{$base}/{$record->getKey()}/edit")->assertOk();
})->with([
    'secciones' => ['menu-sections', fn (Restaurant $r) => MenuSection::factory()->for($r)->create()],
    'platos' => ['dishes', fn (Restaurant $r) => panelDish($r)],
    'horarios' => ['opening-hours', fn (Restaurant $r) => OpeningHour::factory()->for($r)->create()],
    'horarios especiales' => ['special-hours', fn (Restaurant $r) => SpecialHour::factory()->for($r)->create()],
    'promociones' => ['promotions', fn (Restaurant $r) => Promotion::factory()->for($r)->create()],
    'zonas' => ['delivery-zones', fn (Restaurant $r) => DeliveryZone::factory()->for($r)->create()],
]);

test('el dueño abre el inicio y la ficha del panel', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);

    $this->actingAs($owner)->get("/panel/{$restaurant->slug}")->assertOk();
    $this->actingAs($owner)->get("/panel/{$restaurant->slug}/profile")->assertOk();
});
