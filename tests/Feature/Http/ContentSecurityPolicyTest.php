<?php

use App\Providers\AppServiceProvider;
use App\Support\ContentSecurityPolicy;
use App\Support\ContentSecurityPolicyProfiles;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| Política de seguridad de contenido (ADR 0014): App\Support\ContentSecurityPolicy
| armada por App\Http\Middleware\SetContentSecurityPolicy con un nonce nuevo
| en cada petición, que llevan el script del tema, <meta property="csp-nonce">
| y las etiquetas de @vite.
*/

beforeEach(function () {
    // Manifest de Vite propio (tests/Pest.php): las etiquetas de @vite salen
    // de verdad, sin withoutVite().
    $this->publicPath = fakeViteManifest();

    config([
        'services.map.style_url' => 'https://tiles.example.test/v1.2.3/veni-{theme}-{locale}.json',
        'services.map.routes_url' => 'https://tiles.example.test/v1.2.3/roldanillo-rutas.json',
        'security.csp.report_only' => false,
    ]);
});

/** @param TestResponse<Response> $response */
function cspPolicy(TestResponse $response): string
{
    $policy = $response->headers->get('Content-Security-Policy');

    expect($policy)->toBeString();

    return (string) $policy;
}

/** La política sin su nonce, para comparar las de dos peticiones. */
function cspWithoutNonce(string $policy): string
{
    return (string) preg_replace("/'nonce-[^']+'/", "'nonce-…'", $policy);
}

/**
 * CSP_REPORT_ONLY tal como lo lee config/security.php con $value en el entorno.
 */
function cspReportOnlyFromEnv(string $value): mixed
{
    $previous = $_SERVER['CSP_REPORT_ONLY'] ?? null;
    $_SERVER['CSP_REPORT_ONLY'] = $value;

    try {
        $config = require config_path('security.php');
    } finally {
        if ($previous === null) {
            unset($_SERVER['CSP_REPORT_ONLY']);
        } else {
            $_SERVER['CSP_REPORT_ONLY'] = $previous;
        }
    }

    return $config['csp']['report_only'];
}

function cspNonceOf(string $policy): string
{
    expect(preg_match("/'nonce-([^']+)'/", $policy, $matches))->toBe(1);

    return $matches[1];
}

/** @return array<string, list<string>> */
function cspDirectives(string $policy): array
{
    $directives = [];

    foreach (explode(';', $policy) as $directive) {
        $parts = preg_split('/\s+/', trim($directive)) ?: [];
        $name = array_shift($parts);

        if ($name !== null && $name !== '') {
            $directives[$name] = $parts;
        }
    }

    return $directives;
}

test('la página lleva la política completa, con el host del mapa', function () {
    $policy = cspPolicy($this->get('/')->assertOk());
    $nonce = cspNonceOf($policy);

    expect($policy)->toBe(implode('; ', [
        "default-src 'self'",
        "script-src 'self' 'nonce-{$nonce}'",
        "style-src 'self' 'nonce-{$nonce}'",
        "img-src 'self' data: blob: https://tiles.example.test",
        "font-src 'self'",
        "connect-src 'self' https://tiles.example.test",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]));
});

test('nada en línea sin nonce ni eval en scripts y estilos', function () {
    $directives = cspDirectives(cspPolicy($this->get('/')));

    foreach (['script-src', 'style-src', 'default-src'] as $name) {
        expect($directives[$name])->not->toContain("'unsafe-inline'")
            ->not->toContain("'unsafe-eval'")
            ->not->toContain('*');
    }
});

test('el script del tema, la etiqueta del nonce y las de Vite llevan el nonce de la cabecera', function () {
    $response = $this->get('/')->assertOk();
    $nonce = cspNonceOf(cspPolicy($response));
    $html = (string) $response->getContent();

    expect($html)->toContain('<meta property="csp-nonce" nonce="'.$nonce.'">')
        ->toContain('<script nonce="'.$nonce.'">');

    // Todo <script> que se ejecuta lleva el nonce; el de Inertia con los datos
    // de la página es JSON y el navegador no lo ejecuta.
    preg_match_all('/<script\b[^>]*>/', $html, $scripts);
    $executable = array_filter($scripts[0], fn (string $tag) => ! str_contains($tag, 'type="application/json"'));

    expect($executable)->not->toBeEmpty();

    foreach ($executable as $tag) {
        expect($tag)->toContain('nonce="'.$nonce.'"');
    }

    preg_match_all('/<link\b[^>]*build\/assets[^>]*>/', $html, $links);

    expect($links[0])->not->toBeEmpty();

    foreach ($links[0] as $tag) {
        expect($tag)->toContain('nonce="'.$nonce.'"');
    }
});

test('cada petición lleva un nonce nuevo, también con la aplicación ya arrancada (Octane)', function () {
    // Las dos peticiones pasan por la misma aplicación y el mismo servicio
    // Vite, como dos peticiones seguidas en un worker de Octane.
    $first = $this->get('/');
    $second = $this->get('/');
    $firstNonce = cspNonceOf(cspPolicy($first));
    $secondNonce = cspNonceOf(cspPolicy($second));

    expect($firstNonce)->toMatch('/^[A-Za-z0-9]{40}$/')
        ->and($secondNonce)->toMatch('/^[A-Za-z0-9]{40}$/')
        ->and($secondNonce)->not->toBe($firstNonce)
        ->and((string) $second->getContent())->toContain('nonce="'.$secondNonce.'"')
        ->not->toContain($firstNonce);
});

test('CSP_REPORT_ONLY solo informa, sin frame-ancestors (el navegador lo ignora ahí)', function () {
    config(['security.csp.report_only' => true]);

    $response = $this->get('/')
        ->assertOk()
        ->assertHeaderMissing('Content-Security-Policy');
    $policy = (string) $response->headers->get('Content-Security-Policy-Report-Only');

    expect(cspDirectives($policy))->toHaveKey('script-src')
        ->not->toHaveKey('frame-ancestors');
    // X-Frame-Options sigue impidiendo los iframes.
    $response->assertHeader('X-Frame-Options', 'DENY');
});

test('si el grafo de rutas está en otro host, también se puede pedir', function () {
    config(['services.map.routes_url' => 'https://rutas.example.test/roldanillo-rutas.json']);

    $directives = cspDirectives(cspPolicy($this->get('/')));

    expect($directives['connect-src'])->toBe(["'self'", 'https://tiles.example.test', 'https://rutas.example.test']);
});

test('sin URL del mapa no se abre ningún host de afuera', function () {
    config(['services.map.style_url' => null, 'services.map.routes_url' => '']);

    $directives = cspDirectives(cspPolicy($this->get('/')));

    expect($directives['connect-src'])->toBe(["'self'"])
        ->and($directives['img-src'])->toBe(["'self'", 'data:', 'blob:']);
});

test('en desarrollo deja pasar al servidor de Vite, su websocket y el worker por blob', function () {
    File::put($this->publicPath.'/hot', "http://localhost:5173\n");

    $directives = cspDirectives(cspPolicy($this->get('/')->assertOk()));

    expect($directives['script-src'])->toContain('http://localhost:5173')
        ->and($directives['style-src'])->toContain('http://localhost:5173')
        ->and($directives['connect-src'])->toContain('http://localhost:5173')
        ->toContain('ws://localhost:5173')
        ->and($directives['worker-src'])->toBe(["'self'", 'blob:', 'http://localhost:5173']);
});

test('en producción ignora public/hot', function () {
    $this->app['env'] = 'production';
    File::put($this->publicPath.'/hot', 'http://localhost:5173');

    $policy = cspPolicy($this->get('/'));

    // El worker de MapLibre sale de este origen: ni blob: ni el servidor de Vite.
    expect($policy)->not->toContain('localhost:5173')
        ->and(cspDirectives($policy)['worker-src'])->toBe(["'self'"]);
});

test('las páginas de error llevan la política, y su estilo el nonce', function () {
    config(['app.debug' => false]);

    $response = $this->get('/_prueba/no-existe')->assertNotFound();
    $nonce = cspNonceOf(cspPolicy($response));

    expect((string) $response->getContent())->toContain('<style nonce="'.$nonce.'">');
});

test('un error 500 sin debug también lleva la política', function () {
    config(['app.debug' => false]);
    Exceptions::fake();
    Route::get('/_prueba/falla', fn () => throw new RuntimeException('falla de prueba'));

    $response = $this->get('/_prueba/falla')->assertServerError();
    $nonce = cspNonceOf(cspPolicy($response));

    expect((string) $response->getContent())->toContain('<style nonce="'.$nonce.'">');
});

test('la página de error de desarrollo (APP_DEBUG) queda sin política, con el resto de cabeceras', function () {
    // Trae scripts y estilos en línea sin nonce: con la política se vería rota.
    config(['app.debug' => true]);
    Exceptions::fake();
    Route::get('/_prueba/falla', fn () => throw new RuntimeException('falla de prueba'));

    $this->get('/_prueba/falla')
        ->assertServerError()
        ->assertHeaderMissing('Content-Security-Policy')
        ->assertHeaderMissing('Content-Security-Policy-Report-Only')
        ->assertHeader('X-Frame-Options', 'DENY');
});

test('CSP_REPORT_ONLY se lee como booleano: off, no y 0 no lo activan', function (string $value, bool $expected) {
    expect(cspReportOnlyFromEnv($value))->toBe($expected);
})->with([
    'true' => ['true', true],
    'on' => ['on', true],
    '1' => ['1', true],
    'yes' => ['yes', true],
    'false' => ['false', false],
    'off' => ['off', false],
    'no' => ['no', false],
    '0' => ['0', false],
    'vacía' => ['', false],
]);

test('al arrancar en producción con CSP_REPORT_ONLY avisa en el registro', function () {
    $this->app['env'] = 'production';
    config(['security.csp.report_only' => true]);
    Log::spy();

    (new AppServiceProvider($this->app))->boot();

    Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message) => str_contains($message, 'CSP_REPORT_ONLY'));
});

test('sin CSP_REPORT_ONLY, o fuera de producción, no avisa', function (string $env, bool $reportOnly) {
    $this->app['env'] = $env;
    config(['security.csp.report_only' => $reportOnly]);
    Log::spy();

    (new AppServiceProvider($this->app))->boot();

    Log::shouldNotHaveReceived('warning');
})->with([
    'producción, bloqueando' => ['production', false],
    'desarrollo, solo informando' => ['local', true],
]);

test('con una candidata, la política vigente bloquea y la candidata solo informa', function () {
    config(['security.csp.report_candidate' => true]);
    app(ContentSecurityPolicyProfiles::class)->register(
        ContentSecurityPolicy::CANDIDATE_PROFILE,
        fn (ContentSecurityPolicy $policy) => $policy->with('require-trusted-types-for', "'script'"),
    );

    $response = $this->get('/')->assertOk();
    $enforced = cspPolicy($response);
    $candidate = (string) $response->headers->get('Content-Security-Policy-Report-Only');
    $nonce = cspNonceOf($enforced);

    expect(cspDirectives($enforced))->not->toHaveKey('require-trusted-types-for')
        ->toHaveKey('frame-ancestors')
        ->and(cspDirectives($candidate)['require-trusted-types-for'])->toBe(["'script'"])
        ->and(cspDirectives($candidate)['script-src'])->toBe(cspDirectives($enforced)['script-src'])
        ->and(cspDirectives($candidate))->not->toHaveKey('frame-ancestors')
        ->and(cspNonceOf($candidate))->toBe($nonce);
});

test('la candidata no se manda si no está activada, si no hay ninguna o si la vigente ya solo informa', function (bool $enabled, bool $registered, bool $reportOnly) {
    config(['security.csp.report_candidate' => $enabled, 'security.csp.report_only' => $reportOnly]);

    if ($registered) {
        app(ContentSecurityPolicyProfiles::class)->register(
            ContentSecurityPolicy::CANDIDATE_PROFILE,
            fn (ContentSecurityPolicy $policy) => $policy->with('require-trusted-types-for', "'script'"),
        );
    }

    $response = $this->get('/')->assertOk();
    $reported = (string) $response->headers->get('Content-Security-Policy-Report-Only');

    expect($reported)->not->toContain('require-trusted-types-for');
})->with([
    'sin activar' => [false, true, false],
    'activada sin candidata' => [true, false, false],
    'la vigente solo informa' => [true, true, true],
]);

test('una ruta declara su perfil en la acción, también en un grupo, y la política de / no cambia', function () {
    $before = cspWithoutNonce(cspPolicy($this->get('/')->assertOk()));

    app(ContentSecurityPolicyProfiles::class)->register('prueba', fn (ContentSecurityPolicy $policy) => $policy
        ->with('style-src', "'unsafe-inline'")
        ->with('connect-src', 'https://panel.example.test'));
    Route::get('/_prueba/perfil', fn () => 'ok')->setAction(['uses' => fn () => 'ok', 'csp' => 'prueba']);
    Route::group(['csp' => 'prueba'], function () {
        Route::get('/_prueba/perfil-en-grupo', fn () => 'ok');
    });

    expect(cspWithoutNonce(cspPolicy($this->get('/')->assertOk())))->toBe($before);

    foreach (['/_prueba/perfil', '/_prueba/perfil-en-grupo'] as $path) {
        $directives = cspDirectives(cspWithoutNonce(cspPolicy($this->get($path)->assertOk())));

        expect($directives['style-src'])->toContain("'unsafe-inline'")
            ->and($directives['connect-src'])->toContain('https://panel.example.test')
            ->and($directives['script-src'])->toBe(cspDirectives($before)['script-src']);
    }
});

test('el perfil público no se redefine y un perfil desconocido no cae en otra política', function () {
    $profiles = app(ContentSecurityPolicyProfiles::class);

    expect(fn () => $profiles->register(ContentSecurityPolicy::PUBLIC_PROFILE, fn (ContentSecurityPolicy $policy) => $policy))
        ->toThrow(InvalidArgumentException::class, 'público')
        ->and(fn () => $profiles->apply('no-existe', new ContentSecurityPolicy(nonce: 'n0nce')))
        ->toThrow(InvalidArgumentException::class, 'no-existe');
});

test('CSP_FRAME_ANCESTORS nombra quién puede mostrar la app en un iframe, sin X-Frame-Options', function () {
    // Solo en local, por ejemplo el tablero de avance en http://localhost:8765.
    config(['security.csp.frame_ancestors' => ['http://localhost:8765']]);

    $response = $this->get('/')->assertOk()->assertHeaderMissing('X-Frame-Options');

    expect(cspDirectives(cspPolicy($response))['frame-ancestors'])->toBe(['http://localhost:8765']);
});

test("sin CSP_FRAME_ANCESTORS, frame-ancestors 'none' y X-Frame-Options DENY", function () {
    config(['security.csp.frame_ancestors' => []]);

    $response = $this->get('/')->assertOk()->assertHeader('X-Frame-Options', 'DENY');

    expect(cspDirectives(cspPolicy($response))['frame-ancestors'])->toBe(["'none'"]);
});

test('un CSP_FRAME_ANCESTORS que no es una lista de orígenes detiene el arranque', function () {
    $_SERVER['CSP_FRAME_ANCESTORS'] = 'localhost:8765';

    try {
        require config_path('security.php');
    } finally {
        unset($_SERVER['CSP_FRAME_ANCESTORS']);
    }
})->throws(InvalidArgumentException::class, 'CSP_FRAME_ANCESTORS');
