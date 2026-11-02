<?php

use App\Actions\Media\QueueMediaImage;
use App\Actions\Media\RemoveMediaImage;
use App\Enums\MediaKind;
use App\Jobs\ProcessUploadedImage;
use App\Models\Dish;
use App\Support\Media\MediaStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/*
| Poner y quitar la imagen de un registro (#113, ADR 0034, EVA-012): lo que
| hace el panel al guardar, sin el panel.
*/

beforeEach(function () {
    Storage::fake('public');
    Queue::fake();
});

const MEDIA_ACTIONS_PENDING = 'media-pending/11111111-1111-1111-1111-111111111111.png';

test('poner una imagen la recuerda como la última y la manda a la cola al terminar la transacción', function () {
    $dish = Dish::factory()->create();

    app(QueueMediaImage::class)->handle(MediaKind::Dish, $dish->id, MEDIA_ACTIONS_PENDING);

    expect(MediaStore::isExpected(MediaKind::Dish, $dish->id, MEDIA_ACTIONS_PENDING))->toBeTrue();
    // El doble de la cola no espera al commit: se comprueba que lo pide.
    Queue::assertPushed(ProcessUploadedImage::class, fn (ProcessUploadedImage $job): bool => $job->recordId === $dish->id
        && $job->pending === MEDIA_ACTIONS_PENDING
        && $job->afterCommit === true);
});

test('quitarla deja la columna en null sin mover updated_at, cancela la cola y borra las versiones después del commit', function () {
    $dish = Dish::factory()->create();
    $key = 'media/dishes/cccccccccccccccccccc';
    $dish->forceFill(['photo_path' => $key])->save();
    $updatedAt = $dish->refresh()->updated_at?->toIso8601String();
    MediaStore::expect(MediaKind::Dish, $dish->id, MEDIA_ACTIONS_PENDING);

    foreach (MediaKind::Dish->widths() as $width) {
        Storage::disk('public')->put(MediaStore::variantPath($key, $width), 'x');
    }

    $removed = DB::transaction(function () use ($dish): ?string {
        $removed = app(RemoveMediaImage::class)->handle(MediaKind::Dish, $dish->id);

        // Hasta el commit, las versiones siguen: si se deshace, la ficha no se rompe.
        expect(Storage::disk('public')->allFiles())->toHaveCount(3);

        return $removed;
    });

    expect($removed)->toBe($key)
        ->and($dish->refresh()->photo_path)->toBeNull()
        ->and($dish->updated_at?->toIso8601String())->toBe($updatedAt)
        ->and(MediaStore::isExpected(MediaKind::Dish, $dish->id, MEDIA_ACTIONS_PENDING))->toBeFalse()
        ->and(Storage::disk('public')->allFiles())->toBe([]);
});

test('quitarla cuando no hay ninguna no escribe nada', function () {
    $dish = Dish::factory()->create();

    expect(app(RemoveMediaImage::class)->handle(MediaKind::Dish, $dish->id))->toBeNull()
        ->and($dish->refresh()->photo_path)->toBeNull();
});
