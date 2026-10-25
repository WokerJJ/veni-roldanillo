<?php

use App\Providers\Filament\OwnerPanelProvider;
use App\Support\ContentSecurityPolicy;
use Illuminate\Support\Facades\File;

/**
 * La CSP del panel del dueño (ADR 0014 y 0025): su perfil suma solo
 * 'unsafe-eval' en script-src y los atributos de estilo, y solo en /panel.
 */
function panelCspDirectives(string $header): array
{
    $directives = [];
    foreach (explode(';', $header) as $directive) {
        $parts = preg_split('/\s+/', trim($directive)) ?: [];
        $directives[array_shift($parts)] = $parts;
    }

    return $directives;
}

test('el login del panel lleva el perfil «panel»: eval y atributos de estilo, nada más', function () {
    $response = $this->get('/panel/login')->assertOk();
    $directives = panelCspDirectives((string) $response->headers->get('Content-Security-Policy'));

    expect($directives['script-src'])->toContain("'unsafe-eval'")->not->toContain("'unsafe-inline'")
        ->and($directives['style-src'])->not->toContain("'unsafe-inline'")
        ->and($directives['style-src-attr'])->toBe(["'unsafe-inline'"])
        ->and($directives['img-src'])->not->toContain('https://ui-avatars.com')
        ->and($directives['frame-ancestors'])->toBe(["'none'"]);
});

test('la política pública no cambia: sin eval ni atributos de estilo', function () {
    $this->withoutVite();
    $response = $this->get('/credits')->assertOk();
    $header = (string) $response->headers->get('Content-Security-Policy');

    expect($header)->not->toContain('unsafe-eval')->not->toContain('style-src-attr');
});

test('el perfil del panel parte de la política pública y solo le suma', function () {
    $public = new ContentSecurityPolicy('n0nce');
    $panel = OwnerPanelProvider::cspProfile($public)->directives();

    foreach ($public->directives() as $name => $sources) {
        expect($panel[$name])->toContain(...$sources);
    }

    expect(array_values(array_diff(array_keys($panel), array_keys($public->directives()))))->toBe(['style-src-attr']);
});

test('todos los <script> y <style> del login llevan el nonce de la cabecera', function () {
    $response = $this->get('/panel/login')->assertOk();
    preg_match("/'nonce-([^']+)'/", (string) $response->headers->get('Content-Security-Policy'), $match);
    $nonce = $match[1];

    preg_match_all('/<(script|style)\b[^>]*>/i', (string) $response->getContent(), $tags);

    expect($tags[0])->not->toBeEmpty();
    foreach ($tags[0] as $tag) {
        expect($tag)->toContain("nonce=\"{$nonce}\"");
    }
});

test('las vistas de Filament copiadas para el nonce siguen iguales a las del paquete', function (string $copy, string $original) {
    // Al actualizar Filament, si su vista cambió, esta prueba avisa: hay que
    // volver a copiarla y agregarle el nonce (ADR 0025).
    $strip = fn (string $view): string => preg_replace(
        ['/\{\{-- Copia de la vista.*?--\}\}\n/s', '/@php\n    \$styleNonce = Vite::cspNonce\(\);\n@endphp\n\n/', '/ @if \(filled\(\$(cspNonce|styleNonce)\)\) nonce="\{\{ \$(cspNonce|styleNonce) \}\}" @endif/'],
        '',
        $view,
    );

    expect($strip(File::get(resource_path("views/vendor/{$copy}"))))
        ->toBe($strip(File::get(base_path("vendor/{$original}"))));
})->with([
    'layout' => ['filament-panels/components/layout/base.blade.php', 'filament/filament/resources/views/components/layout/base.blade.php'],
    'assets' => ['filament/assets.blade.php', 'filament/support/resources/views/assets.blade.php'],
]);

test('las cookies del panel van con HttpOnly y SameSite, y Secure en producción', function () {
    config(['session.secure' => true]);
    $response = $this->get('/panel/login')->assertOk();

    $session = collect($response->headers->getCookies())->first(fn ($cookie) => $cookie->getName() === config('session.cookie'));
    expect($session)->not->toBeNull()
        ->and($session->isHttpOnly())->toBeTrue()
        ->and($session->isSecure())->toBeTrue()
        ->and($session->getSameSite())->toBe('lax');
});
