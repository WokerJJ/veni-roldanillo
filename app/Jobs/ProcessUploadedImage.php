<?php

namespace App\Jobs;

use App\Enums\MediaKind;
use App\Models\Contracts\BelongsToRestaurant;
use App\Support\Media\ImageInspector;
use App\Support\Media\ImageProcessor;
use App\Support\Media\MediaStore;
use Filament\Notifications\Notification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
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
 * Un original que no pasa la revisión o que GD no abre se descarta sin
 * reintentos (volvería a fallar igual), y un trabajo que falla las tres
 * veces (el disco, la base) borra el original: en los dos casos queda una
 * línea en el registro (tipo, id y motivo, sin rutas) y una notificación en
 * el panel a quienes lo administran (EVA-014).
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

        $path = $pendingDisk->path($this->pending);
        $inspection = ImageInspector::inspect($path, $this->kind);

        if (! $inspection['ok']) {
            $this->discard('invalid');

            return;
        }

        // Una foto de 40 MP abierta en GD ocupa unos 160 MB: más que el
        // límite por defecto de PHP. Se sube solo mientras se procesa y se
        // devuelve después: el worker atiende otros trabajos.
        $memoryLimit = ini_get('memory_limit');
        ini_set('memory_limit', '512M');

        try {
            $variants = ImageProcessor::variants($path, $inspection['mime'], $this->kind);
        } catch (RuntimeException) {
            $this->discard('unreadable');

            return;
        } finally {
            ini_set('memory_limit', $memoryLimit);
        }

        // Si el disco no las guarda, lanza: el trabajo se reintenta y la
        // columna y la imagen anterior siguen como estaban (BUG-014).
        $key = MediaStore::store($this->kind, $this->recordId, $variants);
        $model = $this->kind->model();
        $column = $this->kind->column();

        /** @var array{applied: bool, current: ?string} $result */
        $result = DB::transaction(function () use ($model, $column, $key): array {
            $row = $model::query()->whereKey($this->recordId)->lockForUpdate()->first([$column]);
            $current = $row?->getAttribute($column);
            $current = is_string($current) ? $current : null;

            // Se volvió a revisar con la fila bloqueada: otro original o un
            // «quitar foto» pudieron llegar mientras se procesaba.
            if ($row === null || ! MediaStore::isExpected($this->kind, $this->recordId, $this->pending)) {
                return ['applied' => false, 'current' => $current];
            }

            $model::query()->whereKey($this->recordId)->toBase()->update([$column => $key]);

            return ['applied' => true, 'current' => $current];
        });

        if (! $result['applied']) {
            // La misma foto da la misma clave: si es la publicada, se queda (BUG-016).
            if ($result['current'] !== $key) {
                MediaStore::delete($key, $this->kind);
            }
        } elseif ($result['current'] !== $key) {
            MediaStore::delete($result['current'], $this->kind);
        }

        // El recordatorio no se borra: si llegó otro original justo ahora, ya
        // es el suyo; si no, nombra un archivo que ya no existe y vence solo.
        $pendingDisk->delete($this->pending);
    }

    /** Si falla las tres veces, el original no se queda guardado. */
    public function failed(?Throwable $exception): void
    {
        MediaStore::pendingDisk()->delete($this->pending);
        $this->report('failed');
    }

    /** Un original que no sirve: volvería a fallar igual, no se reintenta. */
    private function discard(string $reason): void
    {
        MediaStore::pendingDisk()->delete($this->pending);
        $this->report($reason);
    }

    private function report(string $reason): void
    {
        Log::info('No se pudo preparar una imagen subida.', ['kind' => $this->kind->value, 'id' => $this->recordId, 'reason' => $reason]);

        $record = $this->kind->model()::query()->find($this->recordId);

        if (! $record instanceof BelongsToRestaurant) {
            return;
        }

        $members = $record->owningRestaurant()->members()->get();

        if ($members->isNotEmpty()) {
            Notification::make()
                ->title(__('panel.media.failed'))
                ->body(__('panel.media.failed_body'))
                ->danger()
                ->sendToDatabase($members);
        }
    }
}
