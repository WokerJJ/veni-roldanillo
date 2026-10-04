<?php

use App\Support\FrameAncestors;

/*
| CSP_FRAME_ANCESTORS (ADR 0014): orígenes que pueden mostrar la app en un
| iframe, solo para entornos locales. Un valor que no es un origen detiene el
| arranque en lugar de terminar en una política que el navegador ignora.
*/

test('sin valor ningún sitio puede mostrar la app en un iframe', function (mixed $value) {
    expect(FrameAncestors::parse($value))->toBe([]);
})->with([
    'sin definir' => [null],
    'vacía' => [''],
    'solo espacios y comas' => [' , ,'],
    'false' => [false],
]);

test('lee orígenes http(s) separados por comas, sin espacios ni repetidos', function () {
    expect(FrameAncestors::parse(' http://localhost:8765, https://tablero.example.test ,http://localhost:8765/ '))
        ->toBe(['http://localhost:8765', 'https://tablero.example.test']);
});

test('rechaza lo que no es un origen', function (string $value) {
    FrameAncestors::parse($value);
})->with([
    'sin esquema' => ['localhost:8765'],
    'con ruta' => ['http://localhost:8765/tablero'],
    'con parámetros' => ['http://localhost:8765?x=1'],
    'otro esquema' => ['file://localhost'],
    'comodín' => ['*'],
    'palabra clave' => ["'self'"],
    'con comillas' => ['http://localhost:8765"'],
    'dentro de una lista' => ['http://localhost:8765, tablero'],
])->throws(InvalidArgumentException::class, 'CSP_FRAME_ANCESTORS');

test('rechaza un valor que no es texto', function () {
    FrameAncestors::parse(['http://localhost:8765']);
})->throws(InvalidArgumentException::class, 'CSP_FRAME_ANCESTORS');
