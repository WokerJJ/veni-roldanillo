<?php

use App\Support\ContentSecurityPolicy;

/*
| ContentSecurityPolicy::with() (ADR 0014): un perfil parte de la política
| pública y le suma lo que su ruta necesita, sin cambiarla para las demás.
*/

test('with() devuelve otra política y deja la original como estaba', function () {
    $public = new ContentSecurityPolicy(nonce: 'n0nce');
    $before = $public->headerValue();

    $panel = $public->with('style-src', "'unsafe-inline'");

    expect($panel)->not->toBe($public)
        ->and($public->headerValue())->toBe($before)
        ->and($panel->directives()['style-src'])->toBe(["'self'", "'nonce-n0nce'", "'unsafe-inline'"]);
});

test('suma fuentes sin repetirlas y se puede encadenar', function () {
    $policy = (new ContentSecurityPolicy(nonce: 'n0nce'))
        ->with('connect-src', 'https://api.example.test', "'self'")
        ->with('connect-src', 'https://api.example.test', 'wss://api.example.test');

    expect($policy->directives()['connect-src'])
        ->toBe(["'self'", 'https://api.example.test', 'wss://api.example.test']);
});

test("en una directiva que era 'none', las fuentes la reemplazan", function () {
    // 'none' junto a otra fuente no es válido: el navegador ignoraría la directiva.
    $policy = (new ContentSecurityPolicy(nonce: 'n0nce'))->with('object-src', "'self'");

    expect($policy->directives()['object-src'])->toBe(["'self'"]);
});

test('agrega directivas nuevas, también las que no llevan fuentes', function () {
    $policy = (new ContentSecurityPolicy(nonce: 'n0nce'))
        ->with('require-trusted-types-for', "'script'")
        ->with('upgrade-insecure-requests');

    expect($policy->headerValue())
        ->toEndWith("; require-trusted-types-for 'script'; upgrade-insecure-requests");
});

test("frame-ancestors es 'none' salvo que se nombren orígenes", function () {
    expect((new ContentSecurityPolicy(nonce: 'n0nce'))->directives()['frame-ancestors'])->toBe(["'none'"])
        ->and((new ContentSecurityPolicy(nonce: 'n0nce', frameAncestors: ['http://localhost:8765']))->directives()['frame-ancestors'])
        ->toBe(['http://localhost:8765']);
});
