<?php

use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\File;
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
    // Manifest de Vite propio en un public temporal, como en RootViewTest:
    // las etiquetas de @vite salen de verdad, sin withoutVite().
    $this->publicPath = sys_get_temp_dir().'/veni-csp-'.bin2hex(random_bytes(4));
    File::ensureDirectoryExists($this->publicPath.'/build');
    File::put($this->publicPath.'/build/manifest.json', (string) json_encode([
        'resources/js/app.ts' => [
            'file' => 'assets/app-prueba.js',
            'src' => 'resources/js/app.ts',
            'isEntry' => true,
            'css' => ['assets/app-prueba.css'],
            'imports' => ['_compartido-prueba.js'],
        ],
        '_compartido-prueba.js' => [
            'file' => 'assets/compartido-prueba.js',
        ],
        'resources/js/pages/Home.vue' => [
            'file' => 'assets/Home-prueba.js',
            'src' => 'resources/js/pages/Home.vue',
            'isDynamicEntry' => true,
        ],
    ]));
    $this->app->usePublicPath($this->publicPath);

    config([
        'services.map.style_url' => 'https://tiles.example.test/v1.2.3/veni-{theme}-{locale}.json',
        'services.map.routes_url' => 'https://tiles.example.test/v1.2.3/roldanillo-rutas.json',
        'security.csp.report_only' => false,
    ]);
});

afterEach(function () {
    File::deleteDirectory($this->publicPath);
});

/** @param TestResponse<Response> $response */
function cspPolicy(TestResponse $response): string
{
    $policy = $response->headers->get('Content-Security-Policy');

    expect($policy)->toBeString();

    return (string) $policy;
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

    expect(cspPolicy($this->get('/')))->not->toContain('localhost:5173')
        ->not->toContain('blob: ;');
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
