<?php

use Illuminate\Support\Facades\DB;

test('las pruebas corren sobre PostgreSQL con PostGIS', function () {
    expect(DB::connection()->getDriverName())->toBe('pgsql')
        ->and(DB::connection()->getDatabaseName())->toBe('veni_test');

    $postgis = DB::selectOne("SELECT extversion FROM pg_extension WHERE extname = 'postgis'");

    expect($postgis)->not->toBeNull('La extensión postgis no está instalada en la base de pruebas.');
});
