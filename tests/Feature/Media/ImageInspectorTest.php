<?php

use App\Enums\MediaKind;
use App\Support\Media\ImageInspector;
use Tests\Support\SyntheticImage;

/*
| Lo que el servidor acepta de un dueño (#113, ADR 0034): se decide por el
| contenido del archivo y por sus dimensiones, antes de abrirlo. No necesita
| GD: corre igual en un entorno sin la extensión.
*/

function imageInspectorFile(string $bytes): string
{
    $path = tempnam(sys_get_temp_dir(), 'veni-img-');
    file_put_contents($path, $bytes);

    return $path;
}

test('acepta un PNG real y dice su tipo y sus dimensiones', function () {
    expect(ImageInspector::inspect(imageInspectorFile(SyntheticImage::png(960, 600)), MediaKind::Dish))
        ->toBe(['ok' => true, 'mime' => 'image/png', 'width' => 960, 'height' => 600]);
});

test('el nombre no cuenta: un texto con extensión de imagen no pasa', function () {
    $path = imageInspectorFile('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    rename($path, $path.'.png');

    expect(ImageInspector::inspect($path.'.png', MediaKind::Dish))->toBe(['ok' => false, 'error' => 'panel.media.errors.type'])
        ->and(ImageInspector::inspect(imageInspectorFile(''), MediaKind::Dish)['ok'])->toBeFalse();
});

test('un GIF es una imagen, pero no de los tipos que se aceptan', function () {
    $gif = 'GIF89a'.pack('vv', 600, 600)."\x00\x00\x00".'restodelarchivo';

    expect(ImageInspector::inspect(imageInspectorFile($gif), MediaKind::Dish))->toBe(['ok' => false, 'error' => 'panel.media.errors.type']);
});

test('rechaza por las dimensiones de la cabecera, sin abrir la imagen', function () {
    expect(ImageInspector::inspect(imageInspectorFile(SyntheticImage::pngHeaderOnly(9000, 600)), MediaKind::Dish)['error'] ?? null)->toBe('panel.media.errors.too_large')
        ->and(ImageInspector::inspect(imageInspectorFile(SyntheticImage::pngHeaderOnly(7000, 7000)), MediaKind::Dish)['error'] ?? null)->toBe('panel.media.errors.too_large')
        ->and(ImageInspector::inspect(imageInspectorFile(SyntheticImage::png(800, 400)), MediaKind::Dish)['error'] ?? null)->toBe('panel.media.errors.too_small');
});

test('el mínimo depende del tipo: una promoción pide menos alto que un plato', function () {
    $wide = imageInspectorFile(SyntheticImage::png(800, 400));

    expect(MediaKind::Dish->minShortSide())->toBe(480)
        ->and(MediaKind::Promotion->minShortSide())->toBe(360)
        ->and(ImageInspector::inspect($wide, MediaKind::Promotion)['ok'])->toBeTrue();
});

test('rechaza lo que pesa más del tope', function () {
    config(['media.max_kilobytes' => 0]);

    expect(ImageInspector::inspect(imageInspectorFile(SyntheticImage::png(960, 960)), MediaKind::Dish)['error'] ?? null)->toBe('panel.media.errors.size');
});

test('los tamaños de cada tipo mantienen su proporción', function () {
    expect(array_map(fn (int $width): int => MediaKind::Dish->heightFor($width), MediaKind::Dish->widths()))->toBe([160, 480, 960])
        ->and(array_map(fn (int $width): int => MediaKind::Promotion->heightFor($width), MediaKind::Promotion->widths()))->toBe([180, 360, 720]);
});
