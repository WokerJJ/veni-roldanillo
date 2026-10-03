<?php

use App\Support\TrustedProxies;

/*
| TRUSTED_PROXIES (ADR 0014): IP o rangos CIDR separados por comas. Un valor
| que no se entiende detiene el arranque en lugar de dejar la app sin confiar
| en nadie en silencio.
*/

test('sin valor no confía en ningún proxy', function (mixed $value) {
    expect(TrustedProxies::parse($value))->toBe([]);
})->with([
    'sin definir' => [null],
    'vacía' => [''],
    'solo espacios y comas' => [' , ,'],
    'false' => [false],
]);

test('lee IP y rangos CIDR de IPv4 e IPv6, sin espacios ni repetidos', function () {
    expect(TrustedProxies::parse(' 172.18.0.1, 10.0.0.0/8 ,::1, fd00::/8, 172.18.0.1 '))
        ->toBe(['172.18.0.1', '10.0.0.0/8', '::1', 'fd00::/8']);
});

test('* confía en cualquiera solo si se escribe explícitamente', function () {
    expect(TrustedProxies::parse(' * '))->toBe('*');
});

test('rechaza lo que no es una IP ni un rango CIDR', function (string $value) {
    TrustedProxies::parse($value);
})->with([
    'un nombre' => ['cloudflare'],
    'un host' => ['proxy.example.test'],
    'IPv4 imposible' => ['300.1.1.1'],
    'máscara IPv4 de más' => ['10.0.0.0/33'],
    'máscara IPv6 de más' => ['fd00::/129'],
    'máscara vacía' => ['10.0.0.0/'],
    'máscara negativa' => ['10.0.0.0/-1'],
    'asterisco dentro de una lista' => ['10.0.0.1, *'],
])->throws(InvalidArgumentException::class, 'TRUSTED_PROXIES');

test('rechaza un valor que no es texto', function () {
    TrustedProxies::parse(['10.0.0.1']);
})->throws(InvalidArgumentException::class, 'TRUSTED_PROXIES');
