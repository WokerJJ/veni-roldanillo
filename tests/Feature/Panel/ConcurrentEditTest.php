<?php

use App\Filament\Owner\Pages\EditRestaurantProfile;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
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
