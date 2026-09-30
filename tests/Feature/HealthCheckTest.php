<?php

use Illuminate\Encryption\MissingAppKeyException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

beforeEach(function () {
    // En producción /up reporta el fallo y responde 500; con debug activo
    // relanzaría la excepción hacia la página de error de desarrollo.
    config(['app.debug' => false]);
    Exceptions::fake();
});

test('/up responde 200 cuando la aplicación está sana', function () {
    $this->get('/up')->assertOk();

    Exceptions::assertNothingReported();
});

test('/up responde 500 sin clave de la aplicación', function () {
    config(['app.key' => '']);

    $this->get('/up')->assertInternalServerError();

    Exceptions::assertReported(MissingAppKeyException::class);
});

test('/up responde 500 cuando la base de datos no responde', function () {
    $connection = DB::getDefaultConnection();

    config(["database.connections.{$connection}.host" => 'host-inexistente.invalid']);
    DB::purge($connection);

    $this->get('/up')->assertInternalServerError();

    Exceptions::assertReported(PDOException::class);
});
