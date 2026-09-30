<?php

use App\Support\GeoPoint;

test('genera EWKT con longitud antes que latitud', function () {
    expect((new GeoPoint(4.4123, -76.1543))->toEwkt())
        ->toBe('SRID=4326;POINT(-76.1543000 4.4123000)');
});

test('lee el EWKB hexadecimal que devuelve PostGIS (little endian con SRID)', function () {
    // SELECT ST_GeogFromText('SRID=4326;POINT(-76.1543 4.4123)')::text
    $hex = '0101000020E6100000'.bin2hex(pack('e', -76.1543)).bin2hex(pack('e', 4.4123));

    $point = GeoPoint::parse($hex);

    expect($point->latitude)->toBe(4.4123)
        ->and($point->longitude)->toBe(-76.1543);
});

test('lee WKB big endian sin SRID', function () {
    $hex = '00'.'00000001'.bin2hex(pack('E', -76.15)).bin2hex(pack('E', 4.41));

    $point = GeoPoint::parse($hex);

    expect($point->latitude)->toBe(4.41)
        ->and($point->longitude)->toBe(-76.15);
});

test('lee EWKT', function () {
    $point = GeoPoint::parse('SRID=4326;POINT(-76.1543 4.4123)');

    expect($point->latitude)->toBe(4.4123)
        ->and($point->longitude)->toBe(-76.1543);
});

test('rechaza geometrías que no son puntos', function () {
    // Tipo 3 = polígono.
    GeoPoint::parse('0103000020E6100000'.str_repeat('00', 20));
})->throws(InvalidArgumentException::class);

test('rechaza texto que no es geográfico', function () {
    GeoPoint::parse('no es un punto');
})->throws(InvalidArgumentException::class);

test('rechaza coordenadas fuera de rango', function () {
    new GeoPoint(91, 0);
})->throws(InvalidArgumentException::class);

test('rechaza coordenadas que no son números finitos', function (float $latitude, float $longitude) {
    new GeoPoint($latitude, $longitude);
})->with([
    'latitud NaN' => [NAN, -76.15],
    'longitud NaN' => [4.41, NAN],
    'latitud infinita' => [INF, -76.15],
    'longitud infinita negativa' => [4.41, -INF],
])->throws(InvalidArgumentException::class);
