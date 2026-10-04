<?php

use App\Support\TrustedHosts;

/*
| Hosts de confianza (ADR 0014): el de APP_URL, exacto, y los nombres del
| propio equipo para la revisión de salud.
*/

test('el host de APP_URL, sin esquema ni puerto, y los del propio equipo', function () {
    expect(TrustedHosts::patterns('https://VeniRoldanillo.co:443/'))
        ->toBe(['^veniroldanillo\.co$', '^127\.0\.0\.1$', '^localhost$']);
});

test('los puntos del host no valen por cualquier carácter', function () {
    [$pattern] = TrustedHosts::patterns('https://veniroldanillo.co');

    expect(preg_match('{'.$pattern.'}i', 'veniroldanillo.co'))->toBe(1)
        ->and(preg_match('{'.$pattern.'}i', 'veniroldanilloxco'))->toBe(0)
        ->and(preg_match('{'.$pattern.'}i', 'www.veniroldanillo.co'))->toBe(0);
});

test('sin un host en APP_URL, solo los del propio equipo', function (mixed $appUrl) {
    expect(TrustedHosts::patterns($appUrl))->toBe(['^127\.0\.0\.1$', '^localhost$']);
})->with([
    'sin definir' => [null],
    'vacía' => [''],
    'sin host' => ['/inicio'],
]);
