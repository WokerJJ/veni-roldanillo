<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TestDatabaseTest extends TestCase
{
    public function test_tests_run_on_postgresql_with_postgis(): void
    {
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('veni_test', DB::connection()->getDatabaseName());

        $postgis = DB::selectOne("SELECT extversion FROM pg_extension WHERE extname = 'postgis'");

        $this->assertNotNull($postgis, 'La extensión postgis no está instalada en la base de pruebas.');
    }
}
