<?php

use App\Models\CatalogGroup;
use App\Models\Category;
use App\Models\Restaurant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

use function Pest\Laravel\artisan;

uses(RefreshDatabase::class);

test('carga las categorías y el catálogo sin crear cuentas ni negocios ficticios', function () {
    artisan('veni:cargar-referencia')->assertSuccessful();

    expect(Category::query()->count())->toBe(6)
        ->and(CatalogGroup::query()->count())->toBeGreaterThan(0)
        ->and(User::query()->count())->toBe(0)
        ->and(Restaurant::query()->count())->toBe(0);
});

test('se puede repetir sin duplicar ni pisar lo que administración editó', function () {
    artisan('veni:cargar-referencia')->assertSuccessful();
    $groups = CatalogGroup::query()->count();
    CatalogGroup::query()->where('slug', 'gaseosas')->update(['name_es' => 'Refrescos']);

    artisan('veni:cargar-referencia')->assertSuccessful();

    expect(Category::query()->count())->toBe(6)
        ->and(CatalogGroup::query()->count())->toBe($groups)
        ->and(CatalogGroup::query()->where('slug', 'gaseosas')->value('name_es'))->toBe('Refrescos');
});

test('corre también en producción, donde los seeders de ejemplo se niegan', function () {
    app()->detectEnvironment(fn () => 'production');

    artisan('veni:cargar-referencia')->assertSuccessful();

    expect(Category::query()->count())->toBe(6);
});
