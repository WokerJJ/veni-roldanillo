<?php

namespace App\Filament\Owner\Concerns;

use App\Filament\Owner\Contracts\ReceivesMediaUploads;
use App\Filament\Owner\Support\MediaUpload;
use App\Jobs\ProcessUploadedImage;
use App\Support\Media\MediaStore;
use Filament\Notifications\Notification;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Lo que hace una página de crear o editar con la imagen del registro al
 * guardar (#113, ADR 0034). El campo (MediaUpload) no es una columna: se
 * saca de los datos antes de escribir el registro y se aplica después.
 *
 * - Una imagen nueva: solo si es un original que guardó el servidor en esta
 *   misma petición (rememberMediaUpload). Se manda a la cola cuando la
 *   transacción termina bien; la columna cambia cuando la cola la procesa.
 * - Sin imagen: la columna queda en null y sus versiones se borran después
 *   del commit. Lo que estuviera en la cola se descarta.
 * - La misma clave que ya tenía, o cualquier otra cosa escrita desde el
 *   navegador: no cambia nada.
 *
 * @phpstan-require-implements ReceivesMediaUploads
 */
trait HandlesMediaUpload
{
    /** @var list<string> */
    protected array $issuedMediaUploads = [];

    protected bool $mediaSubmitted = false;

    protected ?string $submittedMedia = null;

    public function rememberMediaUpload(string $path): void
    {
        $this->issuedMediaUploads[] = $path;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function pullMediaState(array $data): array
    {
        if ($this->ownerResource()::mediaKind() !== null && array_key_exists(MediaUpload::FIELD, $data)) {
            $state = $data[MediaUpload::FIELD];
            $value = is_array($state) ? (array_values($state)[0] ?? null) : $state;

            $this->mediaSubmitted = true;
            $this->submittedMedia = is_string($value) && $value !== '' ? $value : null;
        }

        unset($data[MediaUpload::FIELD], $data[MediaUpload::RIGHTS_FIELD]);

        return $data;
    }

    protected function applyMediaState(Model $record): void
    {
        $kind = $this->ownerResource()::mediaKind();

        if ($kind === null || ! $this->mediaSubmitted) {
            return;
        }

        $this->mediaSubmitted = false;
        $id = $record->getKey();

        if (! is_int($id)) {
            return;
        }

        $value = $this->submittedMedia;
        $current = $record->getAttribute($kind->column());
        $current = is_string($current) ? $current : null;

        if ($value === null) {
            MediaStore::expect($kind, $id, null);

            if ($current !== null) {
                $record->newQuery()->whereKey($id)->toBase()->update([$kind->column() => null]);
                $record->setAttribute($kind->column(), null);
                $record->syncOriginalAttribute($kind->column());
                DB::afterCommit(fn () => MediaStore::delete($current, $kind));
            }

            return;
        }

        if ($value !== $current && MediaStore::isPendingPath($value) && in_array($value, $this->issuedMediaUploads, true)) {
            MediaStore::expect($kind, $id, $value);
            ProcessUploadedImage::dispatch($kind, $id, $value)->afterCommit();
            Notification::make()->title(__('panel.media.processing'))->info()->send();
        }
    }
}
