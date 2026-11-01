<?php

use App\Enums\MediaKind;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\Promotions\Pages\CreatePromotion;
use App\Jobs\ProcessUploadedImage;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Support\Media\MediaStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\Support\SyntheticImage;

uses(RefreshDatabase::class);

/*
| La foto de un plato y la imagen de una promoción desde el panel del dueño
| (#113, ADR 0034): qué se acepta, la declaración de derechos, qué se manda a
| la cola y qué pasa al quitarla. El procesamiento en sí está en
| tests/Feature/Media.
*/

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    Queue::fake();
});

/** @return array{Restaurant, Dish} */
function ownerMediaDish(): array
{
    $restaurant = Restaurant::factory()->claimed()->create();
    $section = MenuSection::factory()->for($restaurant)->create();
    $dish = Dish::factory()->for($section)->create();
    actInPanel(panelMember($restaurant), $restaurant);

    return [$restaurant, $dish];
}

function ownerMediaPng(int $width = 1200, int $height = 1200, string $name = 'plato.png'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, SyntheticImage::png($width, $height));
}

test('subir una foto guarda el original en privado y lo manda a la cola', function () {
    [, $dish] = ownerMediaDish();

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['image' => ownerMediaPng(), 'image_rights' => true])
        ->call('save')
        ->assertHasNoFormErrors();

    $pending = Storage::disk('local')->allFiles(MediaStore::PENDING_DIRECTORY);

    expect($pending)->toHaveCount(1)
        ->and(MediaStore::isPendingPath($pending[0]))->toBeTrue()
        // Nada público todavía, y la columna espera a la cola.
        ->and(Storage::disk('public')->allFiles())->toBe([])
        ->and($dish->refresh()->photo_path)->toBeNull();

    Queue::assertPushed(ProcessUploadedImage::class, fn (ProcessUploadedImage $job): bool => $job->kind === MediaKind::Dish
        && $job->recordId === $dish->id
        && $job->pending === $pending[0]
        && MediaStore::isExpected(MediaKind::Dish, $dish->id, $pending[0]));
});

test('sin la declaración de derechos no se guarda', function () {
    [, $dish] = ownerMediaDish();

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['image' => ownerMediaPng(), 'image_rights' => false])
        ->call('save')
        ->assertHasFormErrors(['image_rights' => 'accepted']);

    Queue::assertNothingPushed();
    expect(Storage::disk('local')->allFiles(MediaStore::PENDING_DIRECTORY))->toBe([]);
});

test('un archivo que no es imagen o una imagen muy pequeña no pasa', function (UploadedFile $file) {
    [, $dish] = ownerMediaDish();

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['image' => $file, 'image_rights' => true])
        ->call('save')
        ->assertHasFormErrors(['image']);

    Queue::assertNothingPushed();
})->with([
    'texto con nombre de imagen' => fn () => UploadedFile::fake()->createWithContent('plato.png', 'no es una imagen'),
    'más chica que el mínimo' => fn () => ownerMediaPng(300, 300),
    // El navegador la manda ya recortada: otra proporción no es lo que dio el editor.
    'sin recortar a 1:1' => fn () => ownerMediaPng(1200, 900),
]);

test('quitar la foto deja el plato sin foto y borra sus versiones', function () {
    [, $dish] = ownerMediaDish();
    $key = 'media/dishes/cccccccccccccccccccc';
    $dish->forceFill(['photo_path' => $key])->save();

    foreach ([160, 480, 960] as $width) {
        Storage::disk('public')->put(MediaStore::variantPath($key, $width), 'x');
    }

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->fillForm(['image' => null])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($dish->refresh()->photo_path)->toBeNull()
        ->and(Storage::disk('public')->allFiles())->toBe([]);
    Queue::assertNothingPushed();
});

test('guardar otra cosa del plato no toca la foto', function () {
    [, $dish] = ownerMediaDish();
    $key = 'media/dishes/dddddddddddddddddddd';
    $dish->forceFill(['photo_path' => $key])->save();

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->assertSchemaStateSet(fn (array $state): bool => array_values($state['image'] ?? [])[0] === $key)
        ->fillForm(['price' => 9000])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($dish->refresh()->photo_path)->toBe($key)->and($dish->price)->toBe(9000);
    Queue::assertNothingPushed();
});

test('una ruta escrita desde el navegador no se procesa ni se publica', function (string $path) {
    [, $dish] = ownerMediaDish();
    Storage::disk('local')->put('media-pending/11111111-1111-1111-1111-111111111111.png', SyntheticImage::png(960, 960));

    Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
        ->set('data.image', ['x' => $path])
        ->call('save');

    expect($dish->refresh()->photo_path)->toBeNull();
    Queue::assertNothingPushed();
})->with([
    'un original que no subió esta página' => 'media-pending/11111111-1111-1111-1111-111111111111.png',
    'otra clave' => 'media/dishes/eeeeeeeeeeeeeeeeeeee',
    'cualquier archivo' => '../.env',
]);

test('una promoción nueva con imagen la manda a la cola como 16:9', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(CreatePromotion::class)
        ->fillForm([
            'title_es' => 'Promo de prueba',
            'starts_at' => now()->format('Y-m-d H:i'),
            'ends_at' => now()->addDay()->format('Y-m-d H:i'),
            'image' => ownerMediaPng(1600, 900, 'promo.png'),
            'image_rights' => true,
        ])
        ->call('create')
        ->assertHasNoFormErrors();

    $promotion = Promotion::query()->sole();
    Queue::assertPushed(ProcessUploadedImage::class, fn (ProcessUploadedImage $job): bool => $job->kind === MediaKind::Promotion && $job->recordId === $promotion->id);
});
