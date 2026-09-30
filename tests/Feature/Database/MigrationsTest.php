<?php

/*
| Sin RefreshDatabase: esta prueba recorre las migraciones de verdad sobre
| PostgreSQL (fresh → reset completo → migrate) y deja la base migrada.
*/

use Illuminate\Support\Facades\Schema;

$tables = [
    'categories', 'neighborhoods', 'restaurants', 'restaurant_user', 'opening_hours',
    'special_hours', 'menu_sections', 'dishes', 'option_groups', 'options',
    'daily_menus', 'promotions', 'delivery_zones', 'restaurant_claims', 'order_intents',
];

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

test('el down de users deja la tabla como antes', function () {
    $this->artisan('migrate:rollback', ['--path' => 'database/migrations/2026_09_30_100000_add_role_and_locale_to_users_table.php'])
        ->assertSuccessful();

    expect(Schema::hasColumn('users', 'role'))->toBeFalse()
        ->and(Schema::getColumnType('users', 'created_at'))->toBe('timestamp');

    $this->artisan('migrate')->assertSuccessful();

    expect(Schema::getColumnType('users', 'created_at'))->toBe('timestamptz');
});
