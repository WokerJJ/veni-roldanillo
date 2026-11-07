<?php

use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * El rango de precios de la carta (#127, ADR 0039): el plato más barato y el
 * más caro, calculados en la consulta con Restaurant::withMenuPriceRange().
 *
 * @return array{min: int, max: int}|null
 */
function menuPriceRangeOf(Restaurant $restaurant): ?array
{
    return Restaurant::query()->withMenuPriceRange()->findOrFail($restaurant->id)->menuPriceRange();
}

/** Una sección con platos de esos precios. */
function sectionWithPrices(Restaurant $restaurant, string $name, int ...$prices): MenuSection
{
    $section = MenuSection::factory()->for($restaurant)->create(['name_es' => $name]);

    foreach ($prices as $price) {
        Dish::factory()->for($section)->create(['price' => $price]);
    }

    return $section;
}

test('va del plato más barato al más caro de la carta', function () {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Platos fuertes', 22000, 16000, 18500);
    sectionWithPrices($restaurant, 'Sopas', 17000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 16000, 'max' => 22000]);
});

test('sin platos no hay rango', function () {
    $restaurant = Restaurant::factory()->create();
    MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes']);

    expect(menuPriceRangeOf($restaurant))->toBeNull();
});

test('con un solo precio, el más barato y el más caro son el mismo', function () {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Almuerzos', 15000, 15000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 15000, 'max' => 15000]);
});

test('lo que el dueño sacó de la carta no cuenta', function () {
    $restaurant = Restaurant::factory()->create();
    $section = sectionWithPrices($restaurant, 'Platos fuertes', 18000);
    Dish::factory()->for($section)->create(['price' => 9000, 'available' => false]);
    Dish::factory()->for($section)->create(['price' => 60000, 'available' => false]);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 18000, 'max' => 18000]);
});

test('solo con platos ocultos no hay rango', function () {
    $restaurant = Restaurant::factory()->create();
    Dish::factory()->for(MenuSection::factory()->for($restaurant))->create(['available' => false]);

    expect(menuPriceRangeOf($restaurant))->toBeNull();
});

test('un plato agotado hoy cuenta: vuelve mañana', function () {
    $restaurant = Restaurant::factory()->create();
    $section = sectionWithPrices($restaurant, 'Platos fuertes', 18000);
    Dish::factory()->for($section)->soldOutToday()->create(['price' => 25000]);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 18000, 'max' => 25000]);
});

test('un plato sin precio (0) no cuenta', function () {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Platos fuertes', 0, 14000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 14000, 'max' => 14000]);
});

/** Nombres de secciones que, al crearlas, no cuentan para el rango (ADR 0039). */
dataset('secciones que no cuentan', [
    'Bebidas', 'BEBIDAS (prueba)', 'Jugos naturales', 'Gaseosa', 'Postres', 'Adiciones', 'Adición',
    'Acompañamientos', 'Extras', 'Cervezas', 'Drinks', 'Desserts', '  bebidas',
    // EVA-055: mayúsculas con tilde, prefijos que no son letras y la lista ampliada.
    'ADICIÓN', 'ACOMPAÑAMIENTOS', 'CÓCTELES', '🥤 Bebidas', '1. Bebidas', '• Jugos', 'Dulce', 'Adicionales',
    'Adicional', 'Adiciones de la casa', 'Acompañantes', 'Porciones', 'Porción', 'Licor', 'Limonadas',
    'Malteadas', 'Batidos', 'Café', 'Cafés', 'Cafetería', 'Tragos', 'Vinos', 'Aguas', 'Sodas', 'Add-ons',
    'Addons', 'Hot drinks', 'Entradas', 'Para picar',
]);

test('las bebidas, los postres y las adiciones no cuentan', function (string $section) {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Platos fuertes', 16000, 22000);
    sectionWithPrices($restaurant, $section, 3000, 45000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 16000, 'max' => 22000]);
})->with('secciones que no cuentan');

test('una sección que solo menciona la palabra después, o la lleva dentro de otra, sí cuenta', function (string $section) {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Platos fuertes', 16000);
    sectionWithPrices($restaurant, $section, 30000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 16000, 'max' => 30000]);
})->with(['Sopas y bebidas', 'Postresitos de la casa', 'Extrasupremo', 'Aguacates rellenos', 'Cafeteros']);

test('al crear una sección, la casilla sale del nombre en español o en inglés', function (string $es, ?string $en, bool $counts) {
    expect(MenuSection::countsForPriceRangeByName($es, $en))->toBe($counts);

    $section = MenuSection::factory()->create(['name_es' => $es, 'name_en' => $en]);

    expect($section->refresh()->counts_for_price_range)->toBe($counts);
})->with([
    'plato' => ['Platos fuertes', 'Main dishes', true],
    'bebidas' => ['Bebidas', null, false],
    'solo el inglés lo dice' => ['Para tomar', 'Drinks', false],
    'el inglés de un plato' => ['Almuerzos', 'Lunch', true],
]);

test('la casilla que eligió el dueño manda sobre el nombre', function () {
    $restaurant = Restaurant::factory()->create();
    $mains = sectionWithPrices($restaurant, 'Platos fuertes', 16000, 22000);
    $mains->update(['counts_for_price_range' => false]);
    $drinks = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Bebidas', 'counts_for_price_range' => true]);
    Dish::factory()->for($drinks)->create(['price' => 5000]);
    sectionWithPrices($restaurant, 'Sopas', 14000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 5000, 'max' => 14000]);
});

test('cambiarle el nombre a una sección no cambia su casilla', function () {
    $section = MenuSection::factory()->create(['name_es' => 'Platos fuertes']);

    $section->update(['name_es' => 'Bebidas']);

    expect($section->refresh()->counts_for_price_range)->toBeTrue();
});

test('con secciones que cuentan pero sin platos que contar, no hay rango (no se cae a las bebidas)', function () {
    $restaurant = Restaurant::factory()->create();
    $lunches = sectionWithPrices($restaurant, 'Almuerzos', 0);
    Dish::factory()->for($lunches)->create(['price' => 15000, 'available' => false]);
    sectionWithPrices($restaurant, 'Bebidas', 3000);

    expect(menuPriceRangeOf($restaurant))->toBeNull();
});

test('funciona con la tabla de restaurantes con alias', function () {
    $restaurant = Restaurant::factory()->create(['name' => 'La Ceiba']);
    sectionWithPrices($restaurant, 'Platos fuertes', 16000, 22000);
    sectionWithPrices($restaurant, 'Bebidas', 3000);

    $aliased = Restaurant::query()->from('restaurants as r')->withMenuPriceRange()->where('r.id', $restaurant->id)->firstOrFail();

    expect($aliased->name)->toBe('La Ceiba')
        ->and($aliased->menuPriceRange())->toBe(['min' => 16000, 'max' => 22000]);
});

test('si la carta solo tiene bebidas o postres, cuentan todos', function () {
    $restaurant = Restaurant::factory()->create();
    sectionWithPrices($restaurant, 'Jugos', 4000, 6000);
    sectionWithPrices($restaurant, 'Postres', 7000);

    expect(menuPriceRangeOf($restaurant))->toBe(['min' => 4000, 'max' => 7000]);
});

test('cada restaurante cuenta solo su carta, en una sola consulta', function () {
    $ceiba = Restaurant::factory()->create(['slug' => 'la-ceiba']);
    $guadual = Restaurant::factory()->create(['slug' => 'el-guadual']);
    Restaurant::factory()->create(['slug' => 'sin-carta']);
    sectionWithPrices($ceiba, 'Platos fuertes', 16000, 22000);
    sectionWithPrices($guadual, 'Almuerzos', 12000);

    $ranges = Restaurant::query()->withMenuPriceRange()->orderBy('id')->get()
        ->mapWithKeys(fn (Restaurant $restaurant): array => [$restaurant->slug => $restaurant->menuPriceRange()])
        ->all();

    expect($ranges)->toBe([
        'la-ceiba' => ['min' => 16000, 'max' => 22000],
        'el-guadual' => ['min' => 12000, 'max' => 12000],
        'sin-carta' => null,
    ]);
});

test('sin pedirlo en la consulta no hay rango, y con columnas elegidas las conserva', function () {
    $restaurant = Restaurant::factory()->create(['name' => 'La Ceiba']);
    sectionWithPrices($restaurant, 'Platos fuertes', 16000);

    $selected = Restaurant::query()->select(['id', 'name'])->withMenuPriceRange()->findOrFail($restaurant->id);

    expect(Restaurant::query()->findOrFail($restaurant->id)->menuPriceRange())->toBeNull()
        ->and($selected->name)->toBe('La Ceiba')
        ->and($selected->menuPriceRange())->toBe(['min' => 16000, 'max' => 16000]);
});
