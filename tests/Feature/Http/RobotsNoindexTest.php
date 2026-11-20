<?php

/*
| ROBOTS_NOINDEX (app.robots_noindex): un dominio de pruebas no se indexa.
| Apagada, /robots.txt es el de siempre y las rutas públicas no llevan
| X-Robots-Tag.
*/

const NOINDEX_HEADER = 'noindex, nofollow, noarchive';

beforeEach(fn () => $this->withoutVite());

it('sin la variable, /robots.txt deja entrar a todo y no hay X-Robots-Tag', function () {
    config(['app.robots_noindex' => false]);

    $response = $this->get('/robots.txt');

    $response->assertOk();
    expect($response->getContent())->toBe("User-agent: *\nDisallow:\n")
        ->and($response->headers->get('Content-Type'))->toStartWith('text/plain')
        ->and($response->headers->has('X-Robots-Tag'))->toBeFalse();

    expect($this->get('/privacy')->headers->has('X-Robots-Tag'))->toBeFalse();
});

it('con la variable, /robots.txt prohíbe todo', function () {
    config(['app.robots_noindex' => true]);

    $response = $this->get('/robots.txt');

    $response->assertOk();
    expect($response->getContent())->toBe("User-agent: *\nDisallow: /\n")
        ->and($response->headers->get('Content-Type'))->toStartWith('text/plain')
        ->and($response->headers->get('X-Robots-Tag'))->toBe(NOINDEX_HEADER);
});

it('con la variable, todas las respuestas llevan X-Robots-Tag, también las de error', function (string $path, int $status) {
    config(['app.robots_noindex' => true]);

    $response = $this->get($path);

    expect($response->getStatusCode())->toBe($status)
        ->and($response->headers->all('x-robots-tag'))->toBe([NOINDEX_HEADER]);
})->with([
    'inicio' => ['/', 200],
    'política de datos' => ['/privacy', 200],
    'ruta que no existe' => ['/no-existe-esta-ruta', 404],
    'panel sin sesión (redirección)' => ['/admin', 302],
    'API' => ['/api/restaurants/no-existe', 404],
]);

it('no duplica la cabecera en las rutas privadas', function () {
    config(['app.robots_noindex' => true]);

    expect($this->get('/confirmar/listo')->headers->all('x-robots-tag'))->toBe([NOINDEX_HEADER]);
});

it('las rutas privadas siguen sin indexarse aunque la variable esté apagada', function () {
    config(['app.robots_noindex' => false]);

    expect($this->get('/confirmar/listo')->headers->get('X-Robots-Tag'))->toBe(NOINDEX_HEADER);
});

it('lee la variable como booleano', function (string $value, bool $expected) {
    putenv("ROBOTS_NOINDEX={$value}");
    $_ENV['ROBOTS_NOINDEX'] = $value;

    try {
        $config = require config_path('app.php');
    } finally {
        putenv('ROBOTS_NOINDEX');
        unset($_ENV['ROBOTS_NOINDEX']);
    }

    expect($config['robots_noindex'])->toBe($expected);
})->with([
    'true' => ['true', true],
    '1' => ['1', true],
    'false' => ['false', false],
    'off' => ['off', false],
    'texto raro' => ['quizás', false],
]);
