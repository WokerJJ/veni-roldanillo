<?php

namespace App\Jobs;

use App\Enums\MediaKind;
use App\Support\Media\ImageInspector;
use App\Support\Media\ImageProcessor;
use App\Support\Media\MediaStore;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Procesa en la cola el original que subió un dueño (#113, ADR 0034): abrir
 * y escalar una foto de celular toma memoria y un par de segundos, y el
 * panel no tiene por qué esperarlo.
 *
 * Al terminar, la columna del registro pasa a la clave nueva y se borran las
 * versiones de la anterior y el original. Si mientras tanto el dueño subió
 * otra o la quitó (MediaStore::expect), este trabajo descarta lo suyo. Si el
 * registro ya no existe, también.
 *
 * La columna se escribe con una consulta directa: no mueve updated_at (el
 * panel lo usa para avisar de ediciones en otra pestaña) ni reindexa en
 * Meilisearch, que no guarda la foto.
 */
class ProcessUploadedImage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    public function __construct(
        public readonly MediaKind $kind,
        public readonly int $recordId,
        public readonly string $pending,
    ) {}

    public function handle(): void
    {
        $pendingDisk = MediaStore::pendingDisk();

        if (! MediaStore::isExpected($this->kind, $this->recordId, $this->pending) || ! $pendingDisk->exists($this->pending)) {
            $pendingDisk->delete($this->pending);

            return;
        }

        // Una foto de 40 MP abierta en GD ocupa unos 160 MB: más que el
        // límite por defecto de PHP. Solo en este proceso.
        ini_set('memory_limit', '512M');

        $path = $pendingDisk->path($this->pending);
        $inspection = ImageInspector::inspect($path, $this->kind);

        if (! $inspection['ok']) {
            $pendingDisk->delete($this->pending);

            return;
        }

        $key = MediaStore::store($this->kind, $this->recordId, ImageProcessor::variants($path, $inspection['mime'], $this->kind));
        $model = $this->kind->model();
        $column = $this->kind->column();

        $previous = DB::transaction(function () use ($model, $column, $key): string|false|null {
            $row = $model::query()->whereKey($this->recordId)->lockForUpdate()->first([$column]);

            // Se volvió a revisar con la fila bloqueada: otro original o un
            // «quitar foto» pudieron llegar mientras se procesaba.
            if ($row === null || ! MediaStore::isExpected($this->kind, $this->recordId, $this->pending)) {
                return false;
            }

            $previous = $row->getAttribute($column);
            $model::query()->whereKey($this->recordId)->toBase()->update([$column => $key]);

            return is_string($previous) ? $previous : null;
        });

        if ($previous === false) {
            MediaStore::delete($key, $this->kind);
        } elseif ($previous !== $key) {
            MediaStore::delete($previous, $this->kind);
        }

        // El recordatorio no se borra: si llegó otro original justo ahora, ya
        // es el suyo; si no, nombra un archivo que ya no existe y vence solo.
        $pendingDisk->delete($this->pending);
    }

    /** Si falla las tres veces, el original no se queda guardado. */
    public function failed(?Throwable $exception): void
    {
        MediaStore::pendingDisk()->delete($this->pending);
    }
}
