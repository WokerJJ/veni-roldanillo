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

test('la primera migración instala PostGIS y btree_gist en una base nueva', function () {
    // Una base creada desde template0 no trae extensiones, como una base
    // gestionada en producción. No se quitan extensiones de la base de
    // pruebas: la imagen postgis/postgis instala otras que dependen de ellas.
    $database = 'veni_extensiones_'.bin2hex(random_bytes(4));
    DB::statement("CREATE DATABASE {$database} TEMPLATE template0");
    config(['database.connections.pgsql_nueva' => [...config('database.connections.pgsql'), 'database' => $database]]);

    try {
        $before = collect(DB::connection('pgsql_nueva')->select('SELECT extname FROM pg_extension'))->pluck('extname');
        expect($before)->not->toContain('postgis');

        $this->artisan('migrate', [
            '--database' => 'pgsql_nueva',
            '--path' => 'database/migrations/0000_00_00_000000_enable_postgis_extensions.php',
        ])->assertSuccessful();

        $after = collect(DB::connection('pgsql_nueva')->select('SELECT extname FROM pg_extension'))->pluck('extname');
        expect($after)->toContain('postgis', 'btree_gist');
    } finally {
        DB::purge('pgsql_nueva');
        DB::statement("DROP DATABASE IF EXISTS {$database} WITH (FORCE)");
    }
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
