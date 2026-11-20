<?php

use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use App\Models\Dish;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

/** La base rechaza la orden (en un savepoint: PostgreSQL aborta la transacción entera). */
function catalogViolation(Closure $write): bool
{
    try {
        DB::transaction($write);
    } catch (QueryException) {
        return true;
    }

    return false;
}

/**
 * El catálogo del modo Campo (ADR 0049): solo texto, el seeder solo agrega y
 * es de administración.
 */
test('el seeder carga lo común en Colombia, con cervezas y licores marcados como alcohol', function () {
    (new CatalogSeeder)->run();

    $groups = CatalogGroup::query()->pluck('is_alcohol', 'slug')->all();

    expect($groups)->toHaveKeys(['gaseosas', 'jugos-de-caja', 'aguas', 'energizantes', 'jugos-naturales', 'adicionales', 'cervezas', 'licores'])
        ->and($groups['cervezas'])->toBeTrue()
        ->and($groups['licores'])->toBeTrue()
        ->and($groups['gaseosas'])->toBeFalse();

    $manzana = CatalogItem::query()->where('brand', 'Postobón')->where('name_es', 'Manzana')->firstOrFail();

    expect($manzana->name_en)->toBe('Apple')
        ->and($manzana->variants()->pluck('label')->all())->toBe(['250 ml', '400 ml', '1,5 L', '2,5 L'])
        ->and(CatalogItem::query()->whereHas('group', fn ($q) => $q->where('slug', 'cervezas'))->where('is_alcohol', false)->exists())->toBeFalse()
        ->and(CatalogItem::query()->whereHas('group', fn ($q) => $q->where('slug', 'gaseosas'))->where('is_alcohol', true)->exists())->toBeFalse();
});

test('correrlo otra vez no duplica ni pisa lo que administración editó', function () {
    (new CatalogSeeder)->run();
    $counts = [CatalogGroup::query()->count(), CatalogItem::query()->count(), CatalogVariant::query()->count()];

    $item = CatalogItem::query()->where('brand', 'Postobón')->where('name_es', 'Manzana')->firstOrFail();
    $item->forceFill(['name_en' => 'Manzana (editado)', 'active' => false])->save();
    $item->variants()->where('label', '400 ml')->update(['active' => false]);

    (new CatalogSeeder)->run();

    expect([CatalogGroup::query()->count(), CatalogItem::query()->count(), CatalogVariant::query()->count()])->toBe($counts)
        ->and($item->refresh()->name_en)->toBe('Manzana (editado)')
        ->and($item->active)->toBeFalse()
        ->and($item->variants()->where('label', '400 ml')->value('active'))->toBeFalse();
});

test('el catálogo es solo texto: ninguna columna guarda logos ni imágenes', function () {
    foreach (['catalog_groups', 'catalog_items', 'catalog_variants'] as $table) {
        $columns = Schema::getColumnListing($table);

        expect(array_filter($columns, fn (string $c): bool => preg_match('/(logo|image|imagen|photo|foto|icon|picture|url|path)/i', $c) === 1))->toBe([], "{$table} tiene una columna de imagen");
    }
});

test('el nombre del plato es producto, marca y presentación', function () {
    expect(CatalogItem::dishName('Manzana', 'Postobón', '400 ml'))->toBe('Manzana Postobón 400 ml')
        ->and(CatalogItem::dishName('Mora', null, 'Jarra'))->toBe('Mora Jarra')
        ->and(CatalogItem::dishName('Arroz', null, null))->toBe('Arroz')
        ->and(CatalogItem::dishName('Arroz', '', ' '))->toBe('Arroz')
        ->and(CatalogItem::dishName('Cerveza Águila', 'Águila', 'Botella 330 ml'))->toBe('Cerveza Águila Botella 330 ml')
        ->and(CatalogItem::dishName('Coca-Cola', 'coca-cola', '400 ml'))->toBe('Coca-Cola 400 ml');
});

test('el nombre del plato cumple el contrato compartido con el teléfono (tests/contracts/dish-name.json)', function () {
    /** @var array{cases: list<array{case: string, name: string, brand: string|null, label: string|null, expected: string}>} $contract */
    $contract = json_decode((string) file_get_contents(base_path('tests/contracts/dish-name.json')), true, flags: JSON_THROW_ON_ERROR);

    expect($contract['cases'])->not->toBeEmpty();

    foreach ($contract['cases'] as $case) {
        expect(CatalogItem::dishName($case['name'], $case['brand'], $case['label']))->toBe($case['expected'], $case['case']);
    }
});

test('la base no deja dos productos iguales en un grupo, ni nombres vacíos, ni dos presentaciones iguales', function () {
    $group = CatalogGroup::factory()->create();
    CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => 'Marca', 'name_es' => 'Cola']);

    expect(catalogViolation(fn () => CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => 'Marca', 'name_es' => 'COLA'])))->toBeTrue()
        ->and(catalogViolation(fn () => CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => null, 'name_es' => ' '])))->toBeTrue();

    // Sin marca, el mismo nombre solo una vez; con otra marca, sí.
    CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => null, 'name_es' => 'Cola']);
    CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => 'Otra', 'name_es' => 'Cola']);

    $item = CatalogItem::factory()->create(['group_id' => $group->id]);
    CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '400 ml']);

    expect(catalogViolation(fn () => CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '400 ml'])))->toBeTrue();
});

test('la unicidad del catálogo ignora mayúsculas y espacios de más en marca, nombre y presentación', function () {
    $group = CatalogGroup::factory()->create();
    CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => 'Postobón', 'name_es' => 'Manzana']);
    CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => null, 'name_es' => 'Jugo de mora']);

    expect(catalogViolation(fn () => CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => ' POSTOBÓN ', 'name_es' => '  manzana '])))->toBeTrue()
        ->and(catalogViolation(fn () => CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => '  ', 'name_es' => 'JUGO DE MORA'])))->toBeTrue()
        ->and(catalogViolation(fn () => CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => '', 'name_es' => ' Jugo de mora'])))->toBeTrue();

    $item = CatalogItem::factory()->create(['group_id' => $group->id]);
    CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '400 ml']);

    expect(catalogViolation(fn () => CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => ' 400 ML '])))->toBeTrue();
});

test('solo administración ve y cambia el catálogo, y nadie lo borra', function () {
    $item = CatalogItem::factory()->create();
    $admin = User::factory()->admin()->create();
    $user = User::factory()->create();

    expect($admin->can('viewAny', CatalogItem::class))->toBeTrue()
        ->and($admin->can('create', CatalogGroup::class))->toBeTrue()
        ->and($admin->can('update', $item))->toBeTrue()
        ->and($admin->can('delete', $item))->toBeFalse()
        ->and($user->can('viewAny', CatalogItem::class))->toBeFalse()
        ->and($user->can('update', $item))->toBeFalse();
});

test('un plato nace sin la marca de alcohol, y se puede marcar', function () {
    $dish = Dish::factory()->create();

    expect($dish->refresh()->is_alcohol)->toBeFalse();

    $dish->update(['is_alcohol' => true]);

    expect($dish->refresh()->is_alcohol)->toBeTrue();
});
