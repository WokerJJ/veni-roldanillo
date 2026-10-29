<?php

use App\Actions\Restaurants\HideRestaurant;
use App\Jobs\SyncRestaurantDishes;
use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\NullEngine;
use Laravel\Scout\Jobs\MakeSearchable;
use Laravel\Scout\Scout;
use Meilisearch\Client;
use Meilisearch\Contracts\DocumentsResults;
use Meilisearch\Endpoints\Indexes;

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
    expect($spy->updated)->toBe([$dish->id, $dish->id]);

    // Fuera de la carta: sale del índice.
    $dish->update(['available' => false]);
    expect($spy->deleted)->toBe([$dish->id]);

    $dish->update(['available' => true]);
    $dish->delete();
    expect($spy->updated)->toBe([$dish->id, $dish->id, $dish->id])
        ->and($spy->deleted)->toBe([$dish->id, $dish->id]);
});

test('un plato fuera de la carta no se indexa', function () {
    expect(panelDish(Restaurant::factory()->create(), ['available' => false])->shouldBeSearchable())->toBeFalse();
});

test('agotar hoy o mover el orden no encola nada para el índice; cambiar lo indexado sí', function () {
    config(['scout.queue' => true]);
    $dish = panelDish(Restaurant::factory()->create());
    Queue::fake();

    $dish->update(['sold_out_until' => now()]);
    $dish->update(['position' => 7, 'tags' => ['picante']]);
    Queue::assertNotPushed(Scout::$makeSearchableJob);

    $dish->update(['description_en' => 'With cassava.']);
    Queue::assertPushed(Scout::$makeSearchableJob, 1);
});

test('reindexar un restaurante saca los platos que salieron de la carta', function () {
    $restaurant = Restaurant::factory()->create();
    $kept = panelDish($restaurant);
    $gone = panelDish($restaurant, ['available' => false]);
    $spy = spyEngine();

    (new SyncRestaurantDishes($restaurant->id))->handle();

    expect($spy->updated)->toBe([$kept->id])
        ->and($spy->deleted)->toBe([$gone->id]);
});

test('veni:search-sync no sube los platos fuera de la carta', function () {
    $restaurant = Restaurant::factory()->create();
    $kept = panelDish($restaurant);
    panelDish($restaurant, ['available' => false]);
    $spy = spyEngine();

    $this->artisan('veni:search-sync')->expectsOutputToContain('Platos enviados al índice: 1.')->assertSuccessful();

    expect($spy->updated)->toBe([$kept->id]);
});

test('veni:search-sync no borra un plato que se publicó mientras recorría el índice', function () {
    $published = panelDish(Restaurant::factory()->create());
    $hidden = Restaurant::factory()->hidden()->create();
    $stale = panelDish($hidden);
    $republished = panelDish(Restaurant::factory()->hidden()->create());

    $deleted = [];
    $indexes = Mockery::mock(Indexes::class)->shouldIgnoreMissing();
    $indexes->allows('getDocuments')->andReturnUsing(function () use ($published, $stale, $republished): DocumentsResults {
        // Lo publican desde el panel justo ahora, sin pasar por la cola.
        Restaurant::query()->whereKey($republished->restaurant_id)->update(['status' => 'unclaimed']);

        return new DocumentsResults([
            'results' => [['id' => $published->id], ['id' => $stale->id], ['id' => $republished->id]],
            'offset' => 0, 'limit' => 1000, 'total' => 3,
        ]);
    });
    $indexes->allows('deleteDocuments')->andReturnUsing(function (array $ids) use (&$deleted): array {
        $deleted = [...$deleted, ...$ids];

        return [];
    });
    $client = Mockery::mock(Client::class)->shouldIgnoreMissing();
    $client->allows('index')->andReturn($indexes);
    app()->instance(Client::class, $client);
    app(EngineManager::class)->forgetDrivers();
    config(['scout.driver' => 'meilisearch', 'scout.queue' => false]);

    $this->artisan('veni:search-sync')->expectsOutputToContain('Platos que sobraban en el índice: 1.')->assertSuccessful();

    expect($deleted)->toBe([$stale->id]);
});

test('veni:search-sync corre todos los días, de a uno y en un solo servidor', function () {
    $event = collect(app(Schedule::class)->events())
        ->first(fn (Event $event): bool => str_contains((string) $event->command, 'veni:search-sync'));

    expect($event)->toBeInstanceOf(Event::class)
        ->and($event?->expression)->toBe('0 4 * * *')
        ->and($event?->withoutOverlapping)->toBeTrue()
        ->and($event?->onOneServer)->toBeTrue();
});

test('los trabajos del índice esperan cada vez más antes de reintentar', function () {
    expect((new SyncRestaurantDishes(1))->backoff)->toBe([10, 60, 300])
        ->and(Scout::$makeSearchableJob)->not->toBe(MakeSearchable::class)
        ->and((new Scout::$makeSearchableJob(new Collection))->backoff())->toBe([10, 60, 300])
        ->and((new Scout::$removeFromSearchJob(new Collection))->backoff())->toBe([10, 60, 300]);
});

describe('categorías de la ficha', function () {
    test('cambiarlas en una ficha publicada reindexa sus platos; sin cambios u oculta, no', function () {
        $restaurant = Restaurant::factory()->create();
        $hidden = Restaurant::factory()->hidden()->create();
        $category = Category::factory()->create();
        Queue::fake();

        $restaurant->refresh()->syncCategories([$category->id]);
        Queue::assertPushed(SyncRestaurantDishes::class, fn (SyncRestaurantDishes $job): bool => $job->restaurantId === $restaurant->id);

        $restaurant->refresh()->syncCategories([$category->id]);
        $hidden->refresh()->syncCategories([$category->id]);
        Queue::assertPushed(SyncRestaurantDishes::class, 1);
    });

    test('si la ficha ya cambió de nombre en el mismo guardado, un solo trabajo', function () {
        $restaurant = Restaurant::factory()->create();
        $category = Category::factory()->create();
        Queue::fake();

        $restaurant->refresh()->forceFill(['name' => 'Otro nombre (ficticio)'])->save();
        $restaurant->syncCategories([$category->id]);

        Queue::assertPushed(SyncRestaurantDishes::class, 1);
    });
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
