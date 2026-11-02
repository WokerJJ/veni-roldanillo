<?php

namespace App\Filament\Owner\Concerns;

use App\Actions\Media\QueueMediaImage;
use App\Actions\Media\RemoveMediaImage;
use App\Filament\Owner\Contracts\ReceivesMediaUploads;
use App\Filament\Owner\Support\MediaUpload;
use App\Support\Media\MediaStore;
use Filament\Notifications\Notification;
use Illuminate\Database\Eloquent\Model;
use Livewire\Attributes\Locked;

/**
 * Lo que hace una página de crear o editar con la imagen del registro al
 * guardar (#113, ADR 0034). El campo (MediaUpload) no es una columna: se
 * saca de los datos antes de escribir el registro y se aplica después. Aquí
 * solo se decide qué pidió el dueño y se le avisa; poner y quitar lo hacen
 * App\Actions\Media\QueueMediaImage y RemoveMediaImage.
 *
 * Se compara con lo que mostraba el campo al abrir la página ($shownMedia,
 * que el navegador no puede cambiar), no con la columna de ahora: la cola
 * escribe la columna sin mover updated_at, así que una página abierta antes
 * de que terminara no se entera (BUG-013, AUD-017).
 *
 * - Una imagen nueva: solo si es un original que guardó el servidor en esta
 *   misma petición (rememberMediaUpload). Se manda a la cola cuando la
 *   transacción termina bien; la columna cambia cuando la cola la procesa.
 * - El campo vacío cuando mostraba una imagen: quitarla. La columna queda en
 *   null, lo que estuviera en la cola se descarta y las versiones se borran
 *   después del commit.
 * - El campo vacío cuando ya se abrió vacío: nada (con una foto en la cola,
 *   el campo lo avisa y guardar el precio no la cancela).
 * - La misma clave que ya tenía, o cualquier otra cosa escrita desde el
 *   navegador: no cambia nada.
 *
 * @phpstan-require-implements ReceivesMediaUploads
 */
trait HandlesMediaUpload
{
    /** La clave (o el original en cola) que mostraba el campo; null si estaba vacío. */
    #[Locked]
    public ?string $shownMedia = null;

    /** @var list<string> */
    protected array $issuedMediaUploads = [];

    protected bool $mediaSubmitted = false;

    protected ?string $submittedMedia = null;

    public function rememberMediaUpload(string $path): void
    {
        $this->issuedMediaUploads[] = $path;
    }

    public function rememberShownMedia(?string $key): void
    {
        $this->shownMedia = $key;
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

        if ($value === null) {
            if ($this->shownMedia !== null) {
                app(RemoveMediaImage::class)->handle($kind, $id);
                $record->setAttribute($kind->column(), null);
                $record->syncOriginalAttribute($kind->column());
                $this->shownMedia = null;
            }

            return;
        }

        if ($value !== $this->shownMedia && MediaStore::isPendingPath($value) && in_array($value, $this->issuedMediaUploads, true)) {
            app(QueueMediaImage::class)->handle($kind, $id, $value);
            // El campo la muestra ahora: vaciarlo y guardar la cancela.
            $this->shownMedia = $value;
            Notification::make()->title(__('panel.media.processing'))->info()->send();
        }
    }
}
