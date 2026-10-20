<?php

use App\Enums\RestaurantStatus;
use App\Models\Category;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Support\GeoPoint;
use App\Support\Osm\OsmImporter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/*
| veni:osm-import (#58, ADR 0021): los locales de comida de OpenStreetMap
| entran como fichas ocultas con nombre, categoría y punto, y su procedencia.
| Overpass no se consulta: la respuesta está guardada en tests/fixtures (los
| locales son inventados) y cualquier otra petición falla.
*/

uses(RefreshDatabase::class);

const OVERPASS_TEST_URL = 'https://overpass.test/api/interpreter';

beforeEach(function () {
    config(['services.overpass.url' => OVERPASS_TEST_URL]);
    Http::preventStrayRequests();
    Storage::fake('local');
});

/**
 * La respuesta guardada, con los cambios que pida la prueba.
 *
 * @param  (callable(array<string, mixed>): array<string, mixed>)|null  $change
 * @return array<string, mixed>
 */
function overpassResponse(?callable $change = null): array
{
    /** @var array<string, mixed> $body */
    $body = json_decode((string) file_get_contents(base_path('tests/fixtures/overpass-roldanillo.json')), true, flags: JSON_THROW_ON_ERROR);

    return $change === null ? $body : $change($body);
}

/**
 * Overpass responde $body desde ahora. Http::fake() suma respuestas en vez de
 * cambiarlas: se registra una vez por prueba y lee la respuesta del momento.
 *
 * @param  array<string, mixed>|null  $body
 */
function fakeOverpass(?array $body = null): void
{
    $registered = app()->bound('overpass.test.body');
    app()->instance('overpass.test.body', $body ?? overpassResponse());

    if (! $registered) {
        Http::fake([OVERPASS_TEST_URL => fn () => Http::response(app('overpass.test.body'))]);
    }
}

/**
 * Cambia los tags de un elemento de la respuesta.
 *
 * @param  array<string, mixed>  $body
 * @param  array<string, mixed>  $tags
 * @return array<string, mixed>
 */
function withTags(array $body, int $id, array $tags): array
{
    foreach ($body['elements'] as $i => $element) {
        if ($element['id'] === $id) {
            $body['elements'][$i]['tags'] = [...$element['tags'], ...$tags];
        }
    }

    return $body;
}

function restaurantFromOsm(int $id): Restaurant
{
    return RestaurantSource::query()->where('element_id', $id)->firstOrFail()->restaurant()->firstOrFail();
}

test('crea fichas ocultas con nombre, categoría y punto, y guarda de dónde vinieron', function () {
    fakeOverpass();

    $this->artisan('veni:osm-import')
        ->expectsTable(['', 'Fichas'], [
            ['Creadas (ocultas)', 9],
            ['Actualizadas', 0],
            ['Sin cambios', 0],
            ['Omitidas: editadas, verificadas o publicadas', 0],
            ['Omitidas: sin nombre', 1],
            ['Ya no están en OpenStreetMap', 0],
        ])
        ->assertSuccessful();

    expect(Restaurant::query()->count())->toBe(9)
        ->and(Restaurant::query()->where('status', '!=', RestaurantStatus::Hidden)->count())->toBe(0);

    $fonda = restaurantFromOsm(9000000001);
    expect($fonda->name)->toBe('Fonda de Prueba')
        ->and($fonda->slug)->toBe('fonda-de-prueba')
        ->and($fonda->location->latitude)->toBe(4.4128)
        ->and($fonda->location->longitude)->toBe(-76.1547)
        ->and($fonda->categories->pluck('slug')->all())->toBe(['restaurantes'])
        ->and($fonda->is_fictitious)->toBeFalse();

    $source = $fonda->source;
    expect($source?->source)->toBe('openstreetmap')
        ->and($source?->element_type)->toBe('node')
        ->and($source?->element_id)->toBe(9000000001)
        ->and($source?->element_kind)->toBe('amenity=restaurant')
        ->and($source?->fetched_at)->not->toBeNull()
        ->and($source?->url())->toBe('https://www.openstreetmap.org/node/9000000001');

    // Vías y relaciones: su centro. Nombres sin espacios de más.
    $perros = restaurantFromOsm(9000000002);
    expect($perros->name)->toBe('Perros de Prueba')
        ->and($perros->location->latitude)->toBe(4.4093);

    // Dos locales con el mismo nombre: slugs distintos.
    expect(restaurantFromOsm(9000000009)->slug)->toBe('cafe-de-prueba-2');
});

test('no importa teléfonos, correos, sitios web, redes ni horarios', function () {
    fakeOverpass();

    $this->artisan('veni:osm-import')->assertSuccessful();

    expect(Restaurant::query()->whereNotNull('phone')->orWhereNotNull('whatsapp')->orWhereNotNull('address')->count())->toBe(0)
        ->and(DB::table('opening_hours')->count())->toBe(0);

    $stored = json_encode([DB::table('restaurants')->get(), DB::table('restaurant_sources')->get()], JSON_THROW_ON_ERROR);
    expect($stored)
        ->not->toContain('300 000')
        ->not->toContain('3000000')
        ->not->toContain('ejemplo.invalid')
        ->not->toContain('fondadeprueba')
        ->not->toContain('Mo-Sa');
});

test('cada tipo de local va a su categoría, y las que faltan se crean una sola vez', function () {
    // Una categoría que ya existe se usa con el nombre que tiene.
    Category::factory()->create(['slug' => 'comidas-rapidas', 'name_es' => 'Rápidas', 'position' => 4]);
    fakeOverpass();

    $this->artisan('veni:osm-import')->assertSuccessful();

    $categoryOf = fn (int $id): array => restaurantFromOsm($id)->categories->pluck('slug')->all();

    expect($categoryOf(9000000001))->toBe(['restaurantes'])
        ->and($categoryOf(9000000002))->toBe(['comidas-rapidas'])
        ->and($categoryOf(9000000003))->toBe(['panaderia-cafeteria'])
        ->and($categoryOf(9000000004))->toBe(['bares'])
        ->and($categoryOf(9000000005))->toBe(['bares'])
        ->and($categoryOf(9000000006))->toBe(['heladeria-postres'])
        ->and($categoryOf(9000000007))->toBe(['plazoletas-de-comida'])
        ->and($categoryOf(9000000008))->toBe(['panaderia-cafeteria'])
        ->and($categoryOf(9000000009))->toBe(['panaderia-cafeteria']);

    expect(Category::query()->where('slug', 'comidas-rapidas')->value('name_es'))->toBe('Rápidas')
        ->and(Category::query()->where('slug', 'bares')->first()?->only(['name_es', 'name_en']))->toBe(['name_es' => 'Bares', 'name_en' => 'Bars'])
        ->and(Category::query()->count())->toBe(6);

    // Las nuevas van al final del catálogo.
    expect(Category::query()->where('slug', 'restaurantes')->value('position'))->toBeGreaterThan(4);

    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();
    expect(Category::query()->count())->toBe(6);
});

test('se puede volver a correr: no duplica nada', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    $this->artisan('veni:osm-import')
        ->expectsTable(['', 'Fichas'], [
            ['Creadas (ocultas)', 0],
            ['Actualizadas', 0],
            ['Sin cambios', 9],
            ['Omitidas: editadas, verificadas o publicadas', 0],
            ['Omitidas: sin nombre', 1],
            ['Ya no están en OpenStreetMap', 0],
        ])
        ->assertSuccessful();

    expect(Restaurant::query()->count())->toBe(9)
        ->and(RestaurantSource::query()->count())->toBe(9)
        ->and(DB::table('category_restaurant')->count())->toBe(9);
});

test('actualiza lo que no se tocó y no pisa lo editado, verificado o publicado', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    // Editada a mano: otro nombre.
    restaurantFromOsm(9000000001)->forceFill(['name' => 'Fonda de Prueba (verificada)'])->save();
    // Verificada en la calle.
    restaurantFromOsm(9000000003)->forceFill(['verified_at' => now()])->save();
    // Publicada.
    restaurantFromOsm(9000000004)->forceFill(['status' => RestaurantStatus::Unclaimed])->save();
    // Otra categoría puesta a mano.
    restaurantFromOsm(9000000006)->categories()->sync([Category::query()->where('slug', 'restaurantes')->value('id')]);

    $renamed = fn (array $body): array => withTags(
        withTags(withTags(withTags(withTags($body, 9000000001, ['name' => 'Fonda Nueva']), 9000000003, ['name' => 'Café Nuevo']), 9000000004, ['name' => 'Bar Nuevo']), 9000000006, ['name' => 'Helados Nuevos']),
        9000000005,
        ['name' => 'Taberna Nueva'],
    );
    fakeOverpass(overpassResponse($renamed));

    $this->artisan('veni:osm-import')
        ->expectsTable(['', 'Fichas'], [
            ['Creadas (ocultas)', 0],
            ['Actualizadas', 1],
            ['Sin cambios', 4],
            ['Omitidas: editadas, verificadas o publicadas', 4],
            ['Omitidas: sin nombre', 1],
            ['Ya no están en OpenStreetMap', 0],
        ])
        ->assertSuccessful();

    expect(restaurantFromOsm(9000000005)->name)->toBe('Taberna Nueva')
        ->and(restaurantFromOsm(9000000001)->name)->toBe('Fonda de Prueba (verificada)')
        ->and(restaurantFromOsm(9000000003)->name)->toBe('Café de Prueba')
        ->and(restaurantFromOsm(9000000004)->name)->toBe('Bar de Prueba')
        ->and(restaurantFromOsm(9000000006)->name)->toBe('Helados de Prueba');

    // Una vez editada, no la vuelve a tocar aunque OpenStreetMap vuelva atrás.
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();
    expect(restaurantFromOsm(9000000001)->name)->toBe('Fonda de Prueba (verificada)');
});

test('informa cuáles ya no están en OpenStreetMap, sin borrarlas', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    $without = fn (array $body): array => [
        ...$body,
        'elements' => array_values(array_filter($body['elements'], fn (array $element): bool => $element['id'] !== 9000000004)),
    ];
    fakeOverpass(overpassResponse($without));

    $this->artisan('veni:osm-import')
        ->expectsOutputToContain('Ya no está: Bar de Prueba (https://www.openstreetmap.org/node/9000000004)')
        ->assertSuccessful();

    $source = RestaurantSource::query()->where('element_id', 9000000004)->firstOrFail();
    expect($source->missing_since)->not->toBeNull()
        ->and(Restaurant::query()->count())->toBe(9);

    // Si vuelve, deja de figurar como ido.
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();
    expect($source->fresh()?->missing_since)->toBeNull();
});

test('lo importado no sale en el GeoJSON público ni tiene ficha visible', function () {
    $this->withoutVite();
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    $features = $this->getJson('/api/restaurants.geojson')->assertOk()->json('features');
    expect($features)->toBe([]);

    $this->get('/restaurants/fonda-de-prueba')->assertNotFound();
});

test('--dry-run cuenta lo mismo y no escribe nada', function () {
    fakeOverpass();

    $this->artisan('veni:osm-import', ['--dry-run' => true])
        ->expectsOutputToContain('Prueba sin escribir')
        ->expectsTable(['', 'Fichas'], [
            ['Creadas (ocultas)', 9],
            ['Actualizadas', 0],
            ['Sin cambios', 0],
            ['Omitidas: editadas, verificadas o publicadas', 0],
            ['Omitidas: sin nombre', 1],
            ['Ya no están en OpenStreetMap', 0],
        ])
        ->assertSuccessful();

    expect(Restaurant::query()->count())->toBe(0)
        ->and(RestaurantSource::query()->count())->toBe(0)
        ->and(Category::query()->count())->toBe(0)
        ->and(Storage::disk('local')->allFiles())->toBe([]);
});

test('escribe el listado para el recorrido con nombre, tipo, enlace y casillas', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    $files = Storage::disk('local')->files('osm');
    expect($files)->toHaveCount(1);

    $list = (string) Storage::disk('local')->get($files[0]);
    expect($list)
        ->toContain('ODbL')
        ->toContain('- [ ] **Fonda de Prueba** · restaurante · [punto en OpenStreetMap](https://www.openstreetmap.org/node/9000000001)')
        ->toContain('- [ ] **Perros de Prueba** · comidas rápidas · [punto en OpenStreetMap](https://www.openstreetmap.org/way/9000000002)')
        ->toContain('- [ ] Existe y está abierto')
        ->toContain('## Sin nombre en OpenStreetMap (1)')
        ->toContain('- [ ] comidas rápidas sin nombre · [punto en OpenStreetMap](https://www.openstreetmap.org/node/9000000010)')
        ->not->toContain('300');
});

test('consulta por el límite del municipio, con un User-Agent propio', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->expectsOutputToContain('límite de Roldanillo')->assertSuccessful();

    Http::assertSentCount(1);
    Http::assertSent(fn (Request $request): bool => str_starts_with($request->header('User-Agent')[0] ?? '', 'veni-roldanillo/')
        && str_contains((string) $request['data'], 'area(3601473594)')
        && str_contains((string) $request['data'], 'out tags center'));
});

test('si la consulta por área falla, repite una vez por el recuadro del límite', function () {
    Http::fake([OVERPASS_TEST_URL => Http::sequence()->push('Gateway Timeout', 504)->push(overpassResponse())]);

    $this->artisan('veni:osm-import')->expectsOutputToContain('recuadro del límite')->assertSuccessful();

    Http::assertSentCount(2);
    Http::assertSent(fn (Request $request): bool => str_contains((string) $request['data'], '('.'4.3712195,-76.2811191,4.5165178,-76.0657686'.')'));
    expect(Restaurant::query()->count())->toBe(9);
});

test('con un 429 no reintenta y no escribe nada', function () {
    Http::fake([OVERPASS_TEST_URL => Http::response('Too Many Requests', 429)]);

    $this->artisan('veni:osm-import')->expectsOutputToContain('429')->assertFailed();

    Http::assertSentCount(1);
    expect(Restaurant::query()->count())->toBe(0);
});

test('si Overpass corta la consulta no marca nada como ido', function () {
    fakeOverpass();
    $this->artisan('veni:osm-import')->assertSuccessful();

    $cut = ['elements' => [], 'remark' => 'runtime error: Query timed out in "query" at line 3 after 91 seconds.'];
    fakeOverpass($cut);

    $this->artisan('veni:osm-import')->expectsOutputToContain('No se importó nada')->assertFailed();

    expect(RestaurantSource::query()->whereNotNull('missing_since')->count())->toBe(0);
});

test('un objeto que vuelve a aparecer en la misma respuesta no da dos fichas', function () {
    $twice = fn (array $body): array => [...$body, 'elements' => [...$body['elements'], $body['elements'][0]]];
    fakeOverpass(overpassResponse($twice));

    $this->artisan('veni:osm-import')->assertSuccessful();

    expect(Restaurant::query()->count())->toBe(9);
});

test('el índice único impide dos fichas del mismo objeto', function () {
    $restaurant = Restaurant::factory()->create();
    $other = Restaurant::factory()->create();
    $row = fn (Restaurant $r): array => [
        'restaurant_id' => $r->id, 'source' => 'openstreetmap', 'element_type' => 'node', 'element_id' => 1,
        'element_kind' => 'amenity=cafe', 'fetched_at' => now(), 'imported_hash' => str_repeat('a', 64),
    ];

    DB::table('restaurant_sources')->insert($row($restaurant));

    expect(fn () => DB::table('restaurant_sources')->insert($row($other)))->toThrow(UniqueConstraintViolationException::class);
});

test('la huella no depende del orden de las categorías', function () {
    $point = new GeoPoint(4.41, -76.15);

    expect(OsmImporter::fingerprint('A', $point, ['b', 'a']))
        ->toBe(OsmImporter::fingerprint('A', $point, ['a', 'b']));
});
