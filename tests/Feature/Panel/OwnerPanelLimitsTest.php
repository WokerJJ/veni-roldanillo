<?php

use App\Filament\Owner\Resources\DeliveryZones\DeliveryZoneResource;
use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Resources\MenuSections\MenuSectionResource;
use App\Filament\Owner\Resources\Promotions\PromotionResource;
use App\Filament\Owner\Resources\SpecialHours\SpecialHourResource;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Topes por restaurante (#18, ADR 0025): todo lo que crea el dueño viaja en
 * las props de la ficha, así que cada recurso tiene un máximo.
 */
test('cada recurso que crece con el dueño tiene su tope', function (string $resource) {
    expect($resource::MAX_PER_RESTAURANT)->toBeInt()->toBeGreaterThan(0);
})->with([
    'platos' => DishResource::class,
    'secciones' => MenuSectionResource::class,
    'promociones' => PromotionResource::class,
    'horarios especiales' => SpecialHourResource::class,
    'zonas' => DeliveryZoneResource::class,
]);

test('con el tope de secciones lleno, no se crea otra: ni el botón ni la página', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    MenuSection::factory()->count(MenuSectionResource::MAX_PER_RESTAURANT)->for($restaurant)->create();
    $owner = panelMember($restaurant);

    $this->actingAs($owner)->get("/panel/{$restaurant->slug}/menu-sections/create")->assertForbidden();

    actInPanel($owner, $restaurant);
    expect(MenuSectionResource::canCreate())->toBeFalse();
});

test('una antes del tope, sí', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    MenuSection::factory()->count(MenuSectionResource::MAX_PER_RESTAURANT - 1)->for($restaurant)->create();
    actInPanel(panelMember($restaurant), $restaurant);

    expect(MenuSectionResource::canCreate())->toBeTrue();
});
