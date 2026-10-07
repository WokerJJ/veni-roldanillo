<?php

use App\Enums\Locale;

/*
| Página sin conexión (#5): el service worker la guarda al instalarse y la
| muestra cuando una navegación falla sin red. Trae los dos idiomas y
| resources/js/offline.ts elige uno antes de pintar.
*/

beforeEach(function () {
    // Manifest de Vite propio (tests/Pest.php), con el script y el estilo de la página.
    fakeViteManifest();
});

test('responde con los textos en los dos idiomas, cada uno con su lang', function (string $locale) {
    $title = trans('offline.title', [], $locale);
    $message = trans('offline.message', [], $locale);
    $retry = trans('offline.retry', [], $locale);

    expect([$title, $message, $retry])->not->toContain('offline.title', 'offline.message', 'offline.retry');

    $this->get('/offline')
        ->assertOk()
        ->assertSee('<section lang="'.$locale.'" data-locale="'.$locale.'"', false)
        ->assertSee('<h1>'.e($title).'</h1>', false)
        ->assertSee(e($message), false)
        ->assertSee('<button type="button" data-retry>'.e($retry).'</button>', false);
})->with(['es', 'en']);

test('sin script, se lee en español', function () {
    // El estilo oculta el inglés hasta que el script elige otro idioma.
    $this->get('/offline')
        ->assertOk()
        ->assertSee('<html lang="'.Locale::DEFAULT->value.'">', false)
        ->assertSee('<title>'.e(trans('offline.title', [], 'es')).' · Vení Roldanillo</title>', false);
});

test('es igual para todos: no depende del idioma de la petición', function () {
    // El service worker la guarda una vez y la muestra en cualquier idioma.
    $spanish = $this->get('/offline', ['Accept-Language' => 'es'])->assertOk()->getContent();
    $english = $this->get('/offline?lang=en', ['Accept-Language' => 'en'])->assertOk()->getContent();

    $withoutNonce = fn (string|false $html): string => (string) preg_replace('/nonce-[^\'"]+|nonce="[^"]*"/', '', (string) $html);

    expect($withoutNonce($english))->toBe($withoutNonce($spanish));
});

test('carga del build su script en <head>, antes de pintar, su estilo y los logos, sin esquema ni host', function () {
    $this->get('/offline')
        ->assertOk()
        ->assertSeeInOrder([
            '<head>',
            '<script src="/build/assets/offline-prueba.js"></script>',
            '<link rel="stylesheet" href="/build/assets/offline-prueba.css">',
            '</head>',
        ], false)
        ->assertSee('src="/build/assets/veni-wordmark-prueba.svg"', false)
        ->assertSee('src="/build/assets/veni-wordmark-blanco-prueba.svg"', false);
});

test('no trae nada en línea: la respuesta guardada no depende de su nonce', function () {
    $html = (string) $this->get('/offline')->assertOk()->getContent();

    expect($html)->not->toMatch('/<script(?![^>]*\ssrc=)[^>]*>/')
        ->and($html)->not->toContain('<style')
        ->and($html)->not->toContain('style="');
});

test('lleva la política de seguridad y las cabeceras de toda respuesta', function () {
    $response = $this->get('/offline')->assertOk();

    expect((string) $response->headers->get('Content-Security-Policy'))->toContain("script-src 'self'");
    $response->assertHeader('X-Content-Type-Options', 'nosniff');
});

test('no abre sesión ni deja cookies, ni con ?lang', function () {
    $response = $this->get('/offline?lang=en')->assertOk();

    expect($response->headers->getCookies())->toBe([]);
});

test('no la indexan los buscadores', function () {
    $this->get('/offline')
        ->assertOk()
        ->assertSee('<meta name="robots" content="noindex">', false);
});
