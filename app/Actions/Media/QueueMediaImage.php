<?php

namespace App\Actions\Media;

use App\Enums\MediaKind;
use App\Jobs\ProcessUploadedImage;
use App\Support\Media\MediaStore;

/**
 * Pone una imagen nueva a un registro (#113, ADR 0034): recuerda el original
 * como el último de ese registro (un trabajo anterior que siga en la cola
 * descarta lo suyo) y lo manda a la cola cuando la transacción termina bien.
 * La columna no cambia aquí: la escribe el trabajo al publicar.
 *
 * No revisa el original ni autoriza: lo hace quien la llama (el panel, con
 * un original que guardó el servidor en esa misma petición).
 */
final class QueueMediaImage
{
    public function handle(MediaKind $kind, int $recordId, string $pending): void
    {
        MediaStore::expect($kind, $recordId, $pending);
        ProcessUploadedImage::dispatch($kind, $recordId, $pending)->afterCommit();
    }
}
