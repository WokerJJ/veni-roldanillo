<?php

namespace Tests\Feature;

use Illuminate\Encryption\MissingAppKeyException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use PDOException;
use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // En producción /up reporta el fallo y responde 500; con debug activo
        // relanzaría la excepción hacia la página de error de desarrollo.
        config(['app.debug' => false]);
        Exceptions::fake();
    }

    public function test_up_returns_200_when_the_application_is_healthy(): void
    {
        $this->get('/up')->assertOk();

        Exceptions::assertNothingReported();
    }

    public function test_up_returns_500_without_an_application_key(): void
    {
        config(['app.key' => '']);

        $this->get('/up')->assertInternalServerError();

        Exceptions::assertReported(MissingAppKeyException::class);
    }

    public function test_up_returns_500_when_the_database_is_unreachable(): void
    {
        $connection = DB::getDefaultConnection();

        config(["database.connections.{$connection}.host" => 'host-inexistente.invalid']);
        DB::purge($connection);

        $this->get('/up')->assertInternalServerError();

        Exceptions::assertReported(PDOException::class);
    }
}
