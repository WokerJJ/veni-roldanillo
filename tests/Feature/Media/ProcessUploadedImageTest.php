<?php

use App\Enums\MediaKind;
use App\Jobs\ProcessUploadedImage;
use App\Models\Dish;
use App\Models\Promotion;
use App\Support\Media\ImageProcessor;
use App\Support\Media\MediaStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\SyntheticImage;

uses(RefreshDatabase::class);

/*
| El trabajo de la cola que convierte el original en las versiones públicas
| (#113, ADR 0034). Las pruebas que abren imágenes necesitan GD con WebP,
| que trae la imagen de la app y la CI (Dockerfile, ci.yml); sin GD se saltan.
*/

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
});

function processUploadedImagePending(string $bytes, string $extension = 'png'): string
{
    $path = MediaStore::PENDING_DIRECTORY.'/'.Str::uuid()->toString().'.'.$extension;
    Storage::disk('local')->put($path, $bytes);

    return $path;
}

/** @return array{int, int, int} */
function processUploadedImageColor(GdImage $image, int $x, int $y): array
{
    $rgb = imagecolorat($image, $x, $y);

    return [($rgb >> 16) & 0xFF, ($rgb >> 8) & 0xFF, $rgb & 0xFF];
}

$requiresGd = fn (): bool => ! function_exists('imagewebp');

test('un plato queda con tres WebP cuadradas y la clave en su columna; el original se borra', function () {
    $dish = Dish::factory()->create();
    $pending = processUploadedImagePending(SyntheticImage::png(1200, 800));
    MediaStore::expect(MediaKind::Dish, $dish->id, $pending);

    (new ProcessUploadedImage(MediaKind::Dish, $dish->id, $pending))->handle();

    $key = $dish->refresh()->photo_path;
    expect(MediaStore::isKey($key, MediaKind::Dish))->toBeTrue()
        ->and(Storage::disk('local')->exists($pending))->toBeFalse();

    foreach ([160, 480, 960] as $width) {
        $bytes = (string) Storage::disk('public')->get(MediaStore::variantPath((string) $key, $width));
        $size = getimagesizefromstring($bytes);

        expect(substr($bytes, 0, 4).substr($bytes, 8, 4))->toBe('RIFFWEBP')
            ->and([$size[0] ?? null, $size[1] ?? null, $size['mime'] ?? null])->toBe([$width, $width, 'image/webp']);
    }
})->skip($requiresGd, 'Necesita GD con WebP.');

test('una promoción queda en 16:9', function () {
    $promotion = Promotion::factory()->create();
    $pending = processUploadedImagePending(SyntheticImage::png(1000, 1000));
    MediaStore::expect(MediaKind::Promotion, $promotion->id, $pending);

    (new ProcessUploadedImage(MediaKind::Promotion, $promotion->id, $pending))->handle();

    $key = (string) $promotion->refresh()->image_path;
    $size = getimagesizefromstring((string) Storage::disk('public')->get(MediaStore::variantPath($key, 1280)));

    expect([$size[0] ?? null, $size[1] ?? null])->toBe([1280, 720])
        ->and(Storage::disk('public')->exists(MediaStore::variantPath($key, 320)))->toBeTrue()
        ->and(Storage::disk('public')->exists(MediaStore::variantPath($key, 640)))->toBeTrue();
})->skip($requiresGd, 'Necesita GD con WebP.');

test('lo publicado no lleva el EXIF del original (ni la ubicación ni nada)', function () {
    $path = tempnam(sys_get_temp_dir(), 'veni-exif-');
    file_put_contents($path, SyntheticImage::jpegWithExif(960, 960, 1, 'GPS-SECRETO-3.4123N'));

    // El original sí lo trae: la prueba no pasa por no haberlo puesto.
    expect((string) file_get_contents($path))->toContain('GPS-SECRETO-3.4123N')->toContain('Exif');

    foreach (ImageProcessor::variants($path, 'image/jpeg', MediaKind::Dish) as $bytes) {
        expect($bytes)->not->toContain('GPS-SECRETO')
            ->not->toContain('Exif')
            ->not->toContain('EXIF')
            ->not->toContain('XMP ');
    }
})->skip($requiresGd, 'Necesita GD con WebP.');

test('gira la foto según la orientación del EXIF antes de recortarla', function () {
    // 960 × 600 con la izquierda roja; la orientación 6 dice «girala 90° a la
    // derecha»: de pie, el rojo queda arriba.
    $path = tempnam(sys_get_temp_dir(), 'veni-exif-');
    file_put_contents($path, SyntheticImage::jpegWithExif(960, 600, 6, 'prueba'));

    $variant = ImageProcessor::variants($path, 'image/jpeg', MediaKind::Dish)[480];
    $image = imagecreatefromstring($variant);

    expect($image)->toBeInstanceOf(GdImage::class);
    /** @var GdImage $image */
    [$topRed] = processUploadedImageColor($image, 240, 20);
    [$bottomRed] = processUploadedImageColor($image, 240, 460);

    expect($topRed)->toBeGreaterThan(150)
        ->and($bottomRed)->toBeLessThan(80);
})->skip(fn (): bool => ! function_exists('imagewebp') || ! function_exists('exif_read_data'), 'Necesita GD con WebP y exif.');

test('el recorte es centrado: de una foto ancha quedan las dos mitades', function () {
    $path = tempnam(sys_get_temp_dir(), 'veni-png-');
    file_put_contents($path, SyntheticImage::png(1600, 800));

    $image = imagecreatefromstring(ImageProcessor::variants($path, 'image/png', MediaKind::Dish)[480]);
    /** @var GdImage $image */
    [$leftRed] = processUploadedImageColor($image, 20, 240);
    [$rightRed] = processUploadedImageColor($image, 460, 240);

    expect($leftRed)->toBeGreaterThan(150)->and($rightRed)->toBeLessThan(80);
})->skip($requiresGd, 'Necesita GD con WebP.');

test('al reemplazarla, se borran las versiones de la anterior', function () {
    $dish = Dish::factory()->create();
    $old = 'media/dishes/aaaaaaaaaaaaaaaaaaaa';
    $dish->forceFill(['photo_path' => $old])->save();

    foreach ([160, 480, 960] as $width) {
        Storage::disk('public')->put(MediaStore::variantPath($old, $width), 'vieja');
    }

    $pending = processUploadedImagePending(SyntheticImage::png(960, 960));
    MediaStore::expect(MediaKind::Dish, $dish->id, $pending);
    (new ProcessUploadedImage(MediaKind::Dish, $dish->id, $pending))->handle();

    expect($dish->refresh()->photo_path)->not->toBe($old)
        ->and(Storage::disk('public')->allFiles('media/dishes'))->toHaveCount(3)
        ->and(Storage::disk('public')->exists(MediaStore::variantPath($old, 480)))->toBeFalse();
})->skip($requiresGd, 'Necesita GD con WebP.');

test('si después llegó otro original o se quitó la foto, el trabajo viejo no hace nada', function () {
    $dish = Dish::factory()->create();
    $stale = processUploadedImagePending(SyntheticImage::png(960, 960));
    MediaStore::expect(MediaKind::Dish, $dish->id, 'media-pending/otro.png');

    (new ProcessUploadedImage(MediaKind::Dish, $dish->id, $stale))->handle();

    expect($dish->refresh()->photo_path)->toBeNull()
        ->and(Storage::disk('public')->allFiles())->toBe([])
        ->and(Storage::disk('local')->exists($stale))->toBeFalse();
});

test('si el plato ya no existe, se descarta', function () {
    $dish = Dish::factory()->create();
    $pending = processUploadedImagePending(SyntheticImage::png(960, 960));
    MediaStore::expect(MediaKind::Dish, $dish->id, $pending);
    $dish->delete();

    (new ProcessUploadedImage(MediaKind::Dish, $dish->id, $pending))->handle();

    expect(Storage::disk('public')->allFiles())->toBe([])
        ->and(Storage::disk('local')->exists($pending))->toBeFalse();
});

test('un original que no es una imagen válida se descarta sin abrirlo', function () {
    $dish = Dish::factory()->create();
    $pending = processUploadedImagePending('no soy una imagen');
    MediaStore::expect(MediaKind::Dish, $dish->id, $pending);

    (new ProcessUploadedImage(MediaKind::Dish, $dish->id, $pending))->handle();

    expect($dish->refresh()->photo_path)->toBeNull()
        ->and(Storage::disk('local')->exists($pending))->toBeFalse();
});

test('borrar un plato borra sus versiones', function () {
    $dish = Dish::factory()->create();
    $key = 'media/dishes/bbbbbbbbbbbbbbbbbbbb';
    $dish->forceFill(['photo_path' => $key])->save();

    foreach ([160, 480, 960] as $width) {
        Storage::disk('public')->put(MediaStore::variantPath($key, $width), 'x');
    }

    $dish->delete();

    expect(Storage::disk('public')->allFiles())->toBe([]);
});

test('la ficha publica solo claves válidas, como URLs del disco', function () {
    expect(MediaStore::published('media/dishes/0123456789abcdef0123', MediaKind::Dish))->toBe([
        'src' => '/storage/media/dishes/0123456789abcdef0123-480.webp',
        'srcset' => '/storage/media/dishes/0123456789abcdef0123-160.webp 160w, /storage/media/dishes/0123456789abcdef0123-480.webp 480w, /storage/media/dishes/0123456789abcdef0123-960.webp 960w',
    ])
        ->and(MediaStore::published('media-pending/x.png', MediaKind::Dish))->toBeNull()
        ->and(MediaStore::published('../../.env', MediaKind::Dish))->toBeNull()
        ->and(MediaStore::published('media/promotions/0123456789abcdef0123', MediaKind::Dish))->toBeNull()
        ->and(MediaStore::published(null, MediaKind::Dish))->toBeNull();
});

test('con el disco en el mismo origen que la app, la URL va sin el origen', function () {
    config(['app.url' => 'http://localhost:8000', 'filesystems.disks.public-real' => ['driver' => 'local', 'root' => storage_path('framework/testing/public-real'), 'url' => 'http://localhost:8000/storage'], 'media.disk' => 'public-real']);

    expect(MediaStore::url('media/dishes/0123456789abcdef0123', 160))->toBe('/storage/media/dishes/0123456789abcdef0123-160.webp');

    // De otro host (un S3 o una CDN), completa: la CSP suma ese origen.
    config(['filesystems.disks.public-real.url' => 'https://fotos.example.test/veni']);
    Storage::forgetDisk('public-real');
    expect(MediaStore::url('media/dishes/0123456789abcdef0123', 160))->toBe('https://fotos.example.test/veni/media/dishes/0123456789abcdef0123-160.webp');
});
