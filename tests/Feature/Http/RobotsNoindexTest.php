<?php

use Illuminate\Http\Middleware\TrustHosts;

/*
| ROBOTS_NOINDEX (app.robots_noindex): un dominio de pruebas no se indexa.
| Lo hace la cabecera X-Robots-Tag; /robots.txt (un archivo de public/, que
| FrankenPHP sirve sin Laravel) deja rastrear a propósito, para que el
| buscador pueda leerla. Apagada, las rutas públicas no llevan la cabecera.
*/

const NOINDEX_HEADER = 'noindex, nofollow, noarchive';

beforeEach(fn () => $this->withoutVite());

it('sin la variable, las rutas públicas no llevan X-Robots-Tag', function () {
    config(['app.robots_noindex' => false]);

    expect($this->get('/privacy')->headers->has('X-Robots-Tag'))->toBeFalse();
});

it('/robots.txt deja rastrear: con la cabecera noindex, Disallow: / impediría leerla', function () {
    expect(file_get_contents(public_path('robots.txt')))->toBe("User-agent: *\nDisallow:\n");
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

it('con la variable, el 400 de un Host que no es el de la app también lleva la cabecera', function () {
    config(['app.robots_noindex' => true, 'app.url' => 'https://veniroldanillo.test', 'app.debug' => false]);
    // TrustHosts no actúa en las pruebas: esta copia sí, como en producción.
    app()->bind(TrustHosts::class, fn ($app) => new class($app) extends TrustHosts
    {
        protected function shouldSpecifyTrustedHosts(): bool
        {
            return true;
        }
    });

    $response = $this->get('http://otro-dominio.example/');

    expect($response->getStatusCode())->toBe(400)
        ->and($response->headers->all('x-robots-tag'))->toBe([NOINDEX_HEADER]);
});

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
