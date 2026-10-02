<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Foundation\Testing\WithCachedConfig;
use Illuminate\Foundation\Testing\WithCachedRoutes;

abstract class TestCase extends BaseTestCase
{
    /*
     * Cada prueba arranca la aplicación de nuevo. La configuración y las rutas
     * no cambian entre pruebas: se resuelven en la primera y las demás las
     * reciben de la memoria del proceso (no se escribe ningún archivo de caché).
     * Lo que una prueba cambie con config() sigue valiendo solo para ella.
     */
    use WithCachedConfig;
    use WithCachedRoutes;

    /**
     * Symfony simula un navegador en inglés (Accept-Language: en-us) en cada
     * petición de prueba y el idioma se elige con esa cabecera (ADR 0010):
     * las pruebas parten sin idioma del navegador y lo fijan cuando importa.
     *
     * @var array<string, string>
     */
    protected $defaultHeaders = [
        'Accept-Language' => '',
    ];
}
