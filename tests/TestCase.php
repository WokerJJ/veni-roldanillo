<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
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
