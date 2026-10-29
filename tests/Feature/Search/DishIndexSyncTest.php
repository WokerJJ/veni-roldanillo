<?php

use App\Actions\Restaurants\HideRestaurant;
use App\Jobs\SyncRestaurantDishes;
use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\NullEngine;

/*
| El índice de platos al día (#17, ADR 0029): qué se indexa, y que cada
| cambio del panel lo mueve. Sin Meilisearch: un motor espía anota lo que
| Scout le manda.
*/

uses(RefreshDatabase::class);

/** Un motor que no busca nada y anota qué platos se subieron y cuáles se sacaron. */
final class SpySearchEngine extends NullEngine
{
    /** @var list<int> */
    public array $updated = [];

    /** @var list<int> */
    public array $deleted = [];

    /** @param  Collection<int, Dish>  $models */
    public function update($models): void
    {
        foreach ($models as $model) {
            $this->updated[] = (int) $model->getKey();
        }
    }

    /** @param  Collection<int, Dish>  $models */
    public function delete($models): void
    {
        foreach ($models as $model) {
            $this->deleted[] = (int) $model->getKey();
        }
    }
}

function spyEngine(): SpySearchEngine
{
    $spy = new SpySearchEngine;
    app(EngineManager::class)->extend('spy', fn () => $spy);
    app(EngineManager::class)->forgetDrivers();
    config(['scout.driver' => 'spy', 'scout.queue' => false]);

    return $spy;
}

test('el documento del índice lleva lo público del plato, su sección y su restaurante, y nada del dueño', function () {
    $restaurant = Restaurant::factory()->create(['name' => 'La Ceiba (ficticio)', 'slug' => 'la-ceiba', 'phone' => '3001234567', 'whatsapp' => '3001234567']);
    $restaurant->members()->attach(User::factory()->create(), ['role' => 'owner']);
    $restaurant->categories()->attach(Category::factory()->create(['slug' => 'tipica', 'name_es' => 'Típica', 'name_en' => 'Traditional']));
    $section = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Sopas', 'name_en' => 'Soups']);
    $dish = Dish::factory()->for($restaurant)->create([
        'menu_section_id' => $section->id, 'name_es' => 'Sancocho', 'name_en' => 'Stew',
        'description_es' => 'Con yuca.', 'description_en' => null, 'price' => 18000,
    ]);

    $document = $dish->fresh()?->toSearchableArray();

    expect($document)->toBe([
        'id' => $dish->id,
        'name_es' => 'Sancocho',
        'name_en' => 'Stew',
        'description_es' => 'Con yuca.',
        'description_en' => null,
        'section_es' => 'Sopas',
        'section_en' => 'Soups',
        'price' => 18000,
        'available' => true,
        'restaurant_slug' => 'la-ceiba',
        'restaurant_name' => 'La Ceiba (ficticio)',
        'category_slugs' => ['tipica'],
        'categories' => ['Típica', 'Traditional'],
    ]);
});

test('solo se indexan los platos de restaurantes publicados', function () {
    expect(panelDish(Restaurant::factory()->create())->shouldBeSearchable())->toBeTrue()
        ->and(panelDish(Restaurant::factory()->claimed()->create())->shouldBeSearchable())->toBeTrue()
        ->and(panelDish(Restaurant::factory()->hidden()->create())->shouldBeSearchable())->toBeFalse();
});

test('crear, editar, agotar y borrar un plato mueven el índice', function () {
    $spy = spyEngine();
    $dish = panelDish(Restaurant::factory()->create());

    expect($spy->updated)->toBe([$dish->id]);

    $dish->update(['price' => 21000]);
    $dish->update(['sold_out_until' => now()]);
    expect($spy->updated)->toBe([$dish->id, $dish->id, $dish->id]);

    $dish->delete();
    expect($spy->deleted)->toBe([$dish->id]);
});

test('un plato de una ficha oculta no se sube: se saca', function () {
    $spy = spyEngine();
    $dish = panelDish(Restaurant::factory()->hidden()->create());
    $dish->update(['price' => 9000]);

    expect($spy->updated)->toBe([])
        ->and($spy->deleted)->toContain($dish->id);
});

test('ocultar una ficha saca sus platos del índice y publicarla los vuelve a subir', function () {
    $restaurant = Restaurant::factory()->create();
    $dishes = [panelDish($restaurant)->id, panelDish($restaurant)->id];
    $spy = spyEngine();

    app(HideRestaurant::class)->handle($restaurant);

    expect($spy->deleted)->toEqualCanonicalizing($dishes)->and($spy->updated)->toBe([]);

    $restaurant->refresh()->forceFill(['status' => 'unclaimed'])->save();

    expect($spy->updated)->toEqualCanonicalizing($dishes);
});

test('cambiar el nombre o el slug del restaurante, o renombrar una sección, los reindexa; lo demás no', function () {
    Queue::fake();
    $restaurant = Restaurant::factory()->create();
    $dish = panelDish($restaurant);

    $restaurant->touchOwnerUpdate();
    $restaurant->update(['description_es' => 'Otra descripción.']);
    Queue::assertNotPushed(SyncRestaurantDishes::class);

    $restaurant->update(['name' => 'Nuevo nombre (ficticio)']);
    Queue::assertPushed(SyncRestaurantDishes::class, fn (SyncRestaurantDishes $job): bool => $job->restaurantId === $restaurant->id);

    $dish->menuSection?->update(['name_es' => 'Otra sección']);
    Queue::assertPushed(SyncRestaurantDishes::class, 2);
});

test('borrar un restaurante saca sus platos del índice antes de la cascada', function () {
    $restaurant = Restaurant::factory()->create();
    $dish = panelDish($restaurant);
    $spy = spyEngine();

    $restaurant->delete();

    expect($spy->deleted)->toBe([$dish->id]);
});

test('veni:search-sync sube los platos publicados y se puede repetir', function () {
    $published = panelDish(Restaurant::factory()->create());
    panelDish(Restaurant::factory()->hidden()->create());
    $spy = spyEngine();

    $this->artisan('veni:search-sync')->expectsOutputToContain('Platos enviados al índice: 1.')->assertSuccessful();
    $this->artisan('veni:search-sync')->assertSuccessful();

    expect($spy->updated)->toBe([$published->id, $published->id]);
});
