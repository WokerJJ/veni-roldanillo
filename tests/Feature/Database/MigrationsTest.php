<?php

/*
| Sin RefreshDatabase: estas pruebas recorren las migraciones de verdad sobre
| PostgreSQL y dejan la base migrada. Cada una empieza con migrate:fresh para
| no depender del orden ni del estado que dejó otra prueba.
*/

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$tables = [
    'categories', 'neighborhoods', 'restaurants', 'category_restaurant', 'restaurant_user',
    'opening_hours', 'special_hours', 'menu_sections', 'dishes', 'option_groups', 'options',
    'daily_menus', 'promotions', 'delivery_zones', 'restaurant_claims', 'order_intents',
];

function installedExtensions(): array
{
    return collect(DB::select('SELECT extname FROM pg_extension'))->pluck('extname')->all();
}

test('las migraciones suben, bajan por completo y vuelven a subir', function () use ($tables) {
    $this->artisan('migrate:fresh')->assertSuccessful();

    foreach ($tables as $table) {
        expect(Schema::hasTable($table))->toBeTrue("Falta la tabla {$table}");
    }
    expect(Schema::hasColumns('users', ['role', 'locale']))->toBeTrue();

    $this->artisan('migrate:reset')->assertSuccessful();

    foreach ([...$tables, 'users'] as $table) {
        expect(Schema::hasTable($table))->toBeFalse("La tabla {$table} sobrevivió al rollback");
    }

    $this->artisan('migrate')->assertSuccessful();

    expect(Schema::hasTable('restaurants'))->toBeTrue();
});

test('la primera migración instala PostGIS y btree_gist', function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
    $this->artisan('migrate:reset')->assertSuccessful();

    // Sin tablas que dependan de ellas, se pueden quitar para comprobar que
    // las migraciones las vuelven a crear (una base nueva no las trae).
    DB::statement('DROP EXTENSION IF EXISTS btree_gist');
    DB::statement('DROP EXTENSION IF EXISTS postgis');

    expect(installedExtensions())->not->toContain('postgis');

    $this->artisan('migrate')->assertSuccessful();

    expect(installedExtensions())->toContain('postgis', 'btree_gist');
});

test('el down de users deja la tabla como antes', function () {
    $this->artisan('migrate:fresh')->assertSuccessful();

    $this->artisan('migrate:rollback', ['--path' => 'database/migrations/2026_09_30_100000_add_role_and_locale_to_users_table.php'])
        ->assertSuccessful();

    expect(Schema::hasColumn('users', 'role'))->toBeFalse()
        ->and(Schema::getColumnType('users', 'created_at'))->toBe('timestamp');

    $this->artisan('migrate')->assertSuccessful();

    expect(Schema::getColumnType('users', 'created_at'))->toBe('timestamptz');
});
