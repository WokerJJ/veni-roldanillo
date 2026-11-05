<?php

use App\Filament\Owner\Pages\EditRestaurantProfile;
use App\Filament\Owner\Pages\Today;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Models\Ingredient;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Features\SupportLockedProperties\CannotUpdateLockedPropertyException;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Control optimista (AUD-016, ADR 0027): si el registro cambió después de
 * abrir el formulario, guardar avisa y no pisa el cambio de la otra persona.
 */
test('la ficha del panel no pisa un cambio guardado mientras estaba abierta', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
    actInPanel(panelMember($restaurant), $restaurant);

    $page = Livewire::test(EditRestaurantProfile::class);

    $this->travel(2)->seconds();
    Restaurant::query()->whereKey($restaurant->id)->update(['name' => 'Desde otra pestaña', 'updated_at' => now()]);

    $page->fillForm(['name' => 'Mi cambio'])->call('save')->assertNotified(__('panel.errors.conflict'));

    expect($restaurant->fresh()?->name)->toBe('Desde otra pestaña');
});

test('sin cambios de otro, la ficha se guarda dos veces seguidas desde el mismo formulario', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    $page = Livewire::test(EditRestaurantProfile::class);
    $page->fillForm(['name' => 'Primera'])->call('save')->assertHasNoFormErrors();
    $this->travel(2)->seconds();
    $page->fillForm(['name' => 'Segunda'])->call('save')->assertHasNoFormErrors();

    expect($restaurant->fresh()?->name)->toBe('Segunda');
});

test('anunciar una demora desde la misma ficha no cuenta como un cambio de otro', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    $page = Livewire::test(EditRestaurantProfile::class);
    $this->travel(2)->seconds();
    $page->callAction('announceDelay', ['minutes' => 30]);
    $page->fillForm(['name' => 'Con demora'])->call('save')->assertHasNoFormErrors();

    expect($restaurant->fresh()?->name)->toBe('Con demora');
});

test('anunciar una demora no se traga un cambio de administración: guardar avisa y el nombre queda', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
    actInPanel(panelMember($restaurant), $restaurant);

    $page = Livewire::test(EditRestaurantProfile::class);
    $this->travel(2)->seconds();
    Restaurant::query()->whereKey($restaurant->id)->update(['name' => 'Desde administración', 'updated_at' => now()]);
    $this->travel(2)->seconds();
    $page->callAction('announceDelay', ['minutes' => 30]);

    $page->fillForm(['name' => 'Mi cambio'])->call('save')->assertNotified(__('panel.errors.conflict'));

    expect($restaurant->fresh()?->name)->toBe('Desde administración')
        ->and($restaurant->fresh()?->delay_minutes)->toBe(30);
});

test('lo que se cambia desde Hoy no bloquea el guardado de la ficha abierta', function () {
    $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
    $dish = panelDish($restaurant);
    $ingredient = Ingredient::factory()->for($restaurant)->create();
    actInPanel(panelMember($restaurant), $restaurant);

    $page = Livewire::test(EditRestaurantProfile::class);

    // En otra pestaña, desde Hoy: demora, agotados y almuerzo (no son campos de la ficha).
    $this->travel(2)->seconds();
    Livewire::test(Today::class)
        ->callAction('announceDelay', data: ['minutes' => 30])
        ->call('setDishSoldOut', $dish->id, true)
        ->call('setIngredientSoldOut', $ingredient->id, true)
        ->callAction('publishLunch', data: ['description_es' => 'Sopa y seco', 'price' => 12000]);
    $this->travel(2)->seconds();
    Livewire::test(Today::class)->callAction('clearDelay');

    $page->fillForm(['name' => 'Con Hoy'])->call('save')->assertHasNoFormErrors();

    expect($restaurant->fresh()?->name)->toBe('Con Hoy')
        ->and($restaurant->fresh()?->updated_by_owner_at)->not->toBeNull();
});

test('el aviso de demora no mueve la versión de la ficha', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $before = $restaurant->fresh()?->updated_at?->toIso8601String();

    $this->travel(2)->seconds();
    $restaurant->announceDelay(30);
    $restaurant->clearDelay();
    $restaurant->touchOwnerUpdate();

    expect($restaurant->fresh()?->updated_at?->toIso8601String())->toBe($before)
        ->and($restaurant->updated_at?->toIso8601String())->toBe($before)
        ->and($restaurant->fresh()?->updated_by_owner_at)->not->toBeNull();
});

test('un plato tampoco se pisa entre dos pestañas', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);
    $dish = panelDish($restaurant, ['name_es' => 'Original']);

    $page = Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()]);
    $this->travel(2)->seconds();
    $dish->newQuery()->whereKey($dish->id)->update(['name_es' => 'Otra pestaña', 'updated_at' => now()]);

    $page->fillForm(['name_es' => 'Mío'])->call('save')->assertNotified(__('panel.errors.conflict'));

    expect($dish->fresh()?->name_es)->toBe('Otra pestaña');
});

test('la versión del formulario no la puede cambiar el navegador', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    expect(fn () => Livewire::test(EditRestaurantProfile::class)->set('loadedVersion', 'otra'))
        ->toThrow(CannotUpdateLockedPropertyException::class);
});
