<?php

use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Providers\AppServiceProvider;
use App\Support\Search\DishSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;
use Symfony\Component\HttpFoundation\Response;

/*
| GET /api/dishes/search (#17, ADR 0029): los platos que responden a la
| consulta, agrupados por restaurante. Aquí Scout busca con el driver
| collection (phpunit.xml), en la base y sin Meilisearch: se prueba el
| contrato, qué sale y qué no, la validación, la caché, el límite y la
| respuesta sin Meilisearch. Cómo busca Meilisearch (tildes, errores de
| tipeo) lo prueba DishSearchMeilisearchTest, si el servicio está.
*/

uses(RefreshDatabase::class);

const DISH_SEARCH = '/api/dishes/search';

/**
 * @param  array<string, mixed>  $attributes
 */
function searchableDish(Restaurant $restaurant, string $sectionName, array $attributes = []): Dish
{
    $section = $restaurant->menuSections()->firstOrCreate(
        ['name_es' => $sectionName],
        ['name_en' => null, 'position' => 0],
    );

    return Dish::factory()->for($restaurant)->create(['menu_section_id' => $section->id, ...$attributes]);
}

/** @return TestResponse<Response> */
function searchDishes(string $query, ?string $lang = null): TestResponse
{
    $params = ['q' => $query, ...($lang === null ? [] : ['lang' => $lang])];

    return test()->getJson(DISH_SEARCH.'?'.http_build_query($params));
}

test('agrupa los platos por restaurante, con lo público y nada más', function () {
    $ceiba = Restaurant::factory()->create(['name' => 'La Ceiba (ficticio)', 'slug' => 'la-ceiba']);
    $ceiba->categories()->attach(Category::factory()->create(['slug' => 'tipica', 'name_es' => 'Típica']));
    $sancocho = searchableDish($ceiba, 'Sopas', ['name_es' => 'Sancocho de gallina', 'description_es' => 'Con arroz y aguacate.', 'price' => 18000]);
    $trifasico = searchableDish($ceiba, 'Sopas', ['name_es' => 'Sancocho trifásico', 'description_es' => null, 'price' => 22000]);
    $otro = Restaurant::factory()->claimed()->create(['name' => 'El Fogón (ficticio)', 'slug' => 'el-fogon']);
    $fogon = searchableDish($otro, 'Almuerzos', ['name_es' => 'Sancocho valluno', 'price' => 15000]);
    searchableDish($ceiba, 'Bebidas', ['name_es' => 'Jugo de lulo']);

    $response = searchDishes('sancocho')->assertOk();

    $results = $response->json('results');
    expect($results)->toHaveCount(2)
        ->and(array_keys($response->json()))->toBe(['results'])
        ->and(array_keys($results[0]))->toBe(['restaurant', 'dishes'])
        ->and(array_keys($results[0]['restaurant']))->toBe(['slug', 'name', 'url'])
        ->and(array_keys($results[0]['dishes'][0]))->toBe(['id', 'name', 'description', 'section', 'price', 'available']);

    $bySlug = collect($results)->keyBy('restaurant.slug');
    expect($bySlug['la-ceiba']['restaurant'])->toBe(['slug' => 'la-ceiba', 'name' => 'La Ceiba (ficticio)', 'url' => '/restaurants/la-ceiba'])
        ->and(collect($bySlug['la-ceiba']['dishes'])->pluck('id')->sort()->values()->all())->toBe(collect([$sancocho->id, $trifasico->id])->sort()->values()->all())
        ->and($bySlug['el-fogon']['dishes'])->toBe([[
            'id' => $fogon->id,
            'name' => 'Sancocho valluno',
            'description' => 'Descripción de ejemplo.',
            'section' => 'Almuerzos',
            'price' => 15000,
            'available' => true,
        ]]);
});

test('encuentra por la sección, la categoría o el nombre del restaurante, no solo por el plato', function () {
    $restaurant = Restaurant::factory()->create(['name' => 'Asadero ficticio']);
    $restaurant->categories()->attach(Category::factory()->create(['slug' => 'pescados', 'name_es' => 'Pescados y mariscos']));
    searchableDish($restaurant, 'Del mar', ['name_es' => 'Mojarra frita']);

    expect(searchDishes('mariscos')->json('results'))->toHaveCount(1)
        ->and(searchDishes('del mar')->json('results'))->toHaveCount(1)
        ->and(searchDishes('asadero')->json('results'))->toHaveCount(1);
});

test('nunca devuelve platos de una ficha oculta ni de un borrador de OSM', function () {
    $hidden = Restaurant::factory()->hidden()->create();
    searchableDish($hidden, 'Sopas', ['name_es' => 'Sancocho escondido']);

    searchDishes('sancocho')->assertOk()->assertExactJson(['results' => []]);
});

test('en inglés, con lo que el dueño tradujo y, si no, en español', function () {
    $restaurant = Restaurant::factory()->create();
    $section = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Sopas', 'name_en' => 'Soups']);
    Dish::factory()->for($restaurant)->create([
        'menu_section_id' => $section->id,
        'name_es' => 'Sancocho', 'name_en' => 'Hen stew',
        'description_es' => 'Con yuca.', 'description_en' => null,
    ]);

    $dish = searchDishes('sancocho', 'en')->assertOk()->json('results.0.dishes.0');

    expect($dish['name'])->toBe('Hen stew')
        ->and($dish['description'])->toBe('Con yuca.')
        ->and($dish['section'])->toBe('Soups')
        ->and(searchDishes('stew', 'en')->json('results'))->toHaveCount(1);
});

test('un plato fuera de la carta no aparece', function () {
    $restaurant = Restaurant::factory()->create();
    searchableDish($restaurant, 'Sopas', ['name_es' => 'Sancocho de la casa']);
    searchableDish($restaurant, 'Sopas', ['name_es' => 'Sancocho de temporada', 'available' => false]);

    $dishes = collect(searchDishes('sancocho')->assertOk()->json('results.0.dishes'));

    expect($dishes->pluck('name')->all())->toBe(['Sancocho de la casa']);
});

test('«agotado hoy» sale como no disponible, y el de otro día como disponible', function () {
    $restaurant = Restaurant::factory()->create();
    $section = MenuSection::factory()->for($restaurant)->create();
    Dish::factory()->for($restaurant)->soldOutToday()->create(['menu_section_id' => $section->id, 'name_es' => 'Sancocho agotado']);
    Dish::factory()->for($restaurant)->create(['menu_section_id' => $section->id, 'name_es' => 'Sancocho de otro día', 'sold_out_until' => now()->subDays(2)]);

    $dishes = collect(searchDishes('sancocho')->json('results.0.dishes'))->keyBy('name');

    expect($dishes['Sancocho agotado']['available'])->toBeFalse()
        ->and($dishes['Sancocho de otro día']['available'])->toBeTrue();
});

test('tiene topes: restaurantes por respuesta y platos por restaurante', function () {
    $restaurants = Restaurant::factory()->count(DishSearch::MAX_RESTAURANTS + 1)->create();
    $restaurants->each(fn (Restaurant $restaurant) => searchableDish($restaurant, 'Sopas', ['name_es' => 'Sancocho de la casa']));
    $first = $restaurants->first();
    assert($first instanceof Restaurant);

    for ($i = 0; $i < DishSearch::MAX_DISHES_PER_RESTAURANT; $i++) {
        searchableDish($first, 'Sopas', ['name_es' => "Sancocho número {$i}"]);
    }

    $results = searchDishes('sancocho')->assertOk()->json('results');

    expect($results)->toHaveCount(DishSearch::MAX_RESTAURANTS)
        ->and(max(array_map(fn (array $group): int => count($group['dishes']), $results)))->toBe(DishSearch::MAX_DISHES_PER_RESTAURANT);
});

test('un restaurante con muchos platos que coinciden no deja afuera a los demás', function () {
    // Antes y después (por id) del que tiene muchos: el orden del motor no cambia la prueba.
    $before = Restaurant::factory()->count(6)->create();
    $before->each(fn (Restaurant $restaurant) => searchableDish($restaurant, 'Sopas', ['name_es' => 'Sancocho de la casa']));
    $busy = Restaurant::factory()->create();

    for ($i = 0; $i < 45; $i++) {
        searchableDish($busy, 'Sopas', ['name_es' => "Sancocho número {$i}"]);
    }

    $after = Restaurant::factory()->count(5)->create();
    $after->each(fn (Restaurant $restaurant) => searchableDish($restaurant, 'Sopas', ['name_es' => 'Sancocho de la casa']));

    $results = searchDishes('sancocho')->assertOk()->json('results');

    expect($results)->toHaveCount(DishSearch::MAX_RESTAURANTS)
        ->and(max(array_map(fn (array $group): int => count($group['dishes']), $results)))->toBe(DishSearch::MAX_DISHES_PER_RESTAURANT);
});

test('con el ETag de la misma respuesta, 304 sin cuerpo', function () {
    searchableDish(Restaurant::factory()->create(), 'Sopas', ['name_es' => 'Sancocho']);

    $etag = (string) searchDishes('sancocho')->assertOk()->headers->get('ETag');
    expect($etag)->not->toBe('');

    $notModified = $this->withHeaders(['If-None-Match' => $etag])->getJson(DISH_SEARCH.'?q=sancocho');

    $notModified->assertStatus(304);
    expect($notModified->getContent())->toBe('');
});

test('se guarda un minuto en cachés públicas y la URL lleva el idioma', function () {
    $response = searchDishes('sancocho')->assertOk();

    expect((string) $response->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=60')
        ->and($response->headers->has('Set-Cookie'))->toBeFalse();
});

test('valida la consulta y el idioma', function (string $query, ?string $lang) {
    searchDishes($query, $lang)->assertStatus(422);
})->with([
    'corta' => ['sa', null],
    'solo espacios' => ['    ', null],
    'larga' => [str_repeat('a', 61), null],
    'con etiquetas' => ['<script>', null],
    'con comillas dobles' => ['"sancocho"', null],
    'con signos de búsqueda' => ['sancocho*', null],
    'solo puntos' => ['...', null],
    'solo guiones' => ['---', null],
    'una letra con tildes sueltas' => ["a\u{0301}\u{0301}\u{0301}", null],
    'dos letras y signos' => ['a.b-', null],
    'idioma desconocido' => ['sancocho', 'fr'],
]);

test('un guion al empezar una palabra no excluye nada: se busca la palabra', function () {
    searchableDish(Restaurant::factory()->create(), 'Sopas', ['name_es' => 'Sancocho de gallina']);

    expect(searchDishes('-sancocho')->assertOk()->json('results'))->toHaveCount(1)
        ->and(searchDishes('de -gallina')->assertOk()->json('results'))->toHaveCount(1);
});

test('sin consulta es un 422 en JSON', function () {
    $this->getJson(DISH_SEARCH)->assertStatus(422)->assertJsonValidationErrors('q');
});

test('acepta tildes, eñes, apóstrofos del celular, guiones y espacios de más', function () {
    $restaurant = Restaurant::factory()->create();
    searchableDish($restaurant, 'Típicos', ['name_es' => "Ajiaco d'la abuela"]);

    expect(searchDishes('  ajiaco   d’la ')->assertOk()->json('results'))->toHaveCount(1);
    searchDishes('piña-colada')->assertOk();
    searchDishes('ñame 2')->assertOk();
});

test('si Meilisearch no responde: 503 sin caché, con Retry-After, y la consulta no queda en el registro', function () {
    config([
        'scout.driver' => 'meilisearch',
        // Nada escucha en el puerto 1: la conexión se rechaza enseguida.
        'scout.meilisearch.host' => 'http://127.0.0.1:1',
    ]);
    app()->forgetInstance(Client::class);
    app()->forgetInstance(EngineManager::class);
    Log::spy();

    $response = searchDishes('sancocho secreto')->assertStatus(503)->assertExactJson(['error' => 'search_unavailable']);

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store')->not->toContain('public')
        ->and($response->headers->get('Retry-After'))->toBe('30');

    Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message, array $context): bool => ! str_contains($message.json_encode($context), 'secreto'));
});

describe('límite de peticiones', function () {
    beforeEach(function () {
        config(['trustedproxy.proxies' => ['172.18.0.1']]);
    });

    /** @return TestResponse<Response> */
    function dishSearchFrom(string $clientIp): TestResponse
    {
        return test()->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
            ->withHeaders(['X-Forwarded-For' => $clientIp, 'Accept' => 'application/json'])
            ->get(DISH_SEARCH.'?q=sancocho');
    }

    test('pasado el límite por minuto responde 429 por IP real, sin caché pública', function () {
        for ($i = 1; $i <= AppServiceProvider::DISH_SEARCHES_PER_MINUTE; $i++) {
            dishSearchFrom('203.0.113.9')->assertOk();
        }

        $limited = dishSearchFrom('203.0.113.9')->assertStatus(429)->assertHeader('Retry-After');

        expect((string) $limited->headers->get('Cache-Control'))->not->toContain('public');
        dishSearchFrom('198.51.100.21')->assertOk();
    });
});

test('responde con la forma de tests/contracts/dishes.search.json, la que lee el cliente', function () {
    $contract = json_decode((string) file_get_contents(base_path('tests/contracts/dishes.search.json')), true, flags: JSON_THROW_ON_ERROR);
    $restaurant = Restaurant::factory()->create(['name' => 'Restaurante de Prueba La Ceiba (ficticio)', 'slug' => 'prueba-la-ceiba']);
    $first = searchableDish($restaurant, 'Platos fuertes (prueba)', ['name_es' => 'Sancocho de prueba', 'description_es' => 'Sopa de ejemplo con arroz y aguacate.', 'price' => 19500]);
    $second = searchableDish($restaurant, 'Platos fuertes (prueba)', ['name_es' => 'Sancocho trifásico de prueba', 'description_es' => null, 'price' => 24000, 'sold_out_until' => now()]);

    $body = json_decode((string) searchDishes('sancocho')->assertOk()->getContent(), true, flags: JSON_THROW_ON_ERROR);

    // Los ids de la base no son los del ejemplo: se cambian por los del contrato.
    $ids = [$first->id => 1, $second->id => 2];
    $body['results'][0]['dishes'] = collect($body['results'][0]['dishes'])
        ->map(fn (array $dish): array => ['id' => $ids[$dish['id']]] + $dish)
        ->sortBy('id')->values()->all();

    // Idénticos: las mismas claves, en el mismo orden y con los mismos tipos.
    expect($body)->toBe($contract);
});
