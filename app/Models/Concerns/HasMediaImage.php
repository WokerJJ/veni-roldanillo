<?php

namespace App\Models\Concerns;

use App\Enums\MediaKind;
use App\Support\Media\MediaStore;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Un registro con imagen procesada (#113, ADR 0034): al borrarlo se borran
 * sus versiones y se descarta lo que esté esperando en la cola. Un borrado en
 * cascada desde la base (el restaurante entero) no pasa por aquí: lo que
 * quede se nombra por el id del registro, que no se reutiliza.
 *
 * @phpstan-require-extends Model
 */
trait HasMediaImage
{
    abstract public static function mediaKind(): MediaKind;

    public static function bootHasMediaImage(): void
    {
        // Antes de borrar: se descarta la cola y se lee la clave con la fila
        // bloqueada, como la escribe el trabajo al publicar (AUD-018). Un
        // trabajo que ya estaba publicando termina antes y su clave es la que
        // se lee; uno que llega después ya no es el esperado.
        static::deleting(function (Model $record): void {
            $kind = static::mediaKind();
            $id = $record->getKey();

            if (! is_int($id)) {
                return;
            }

            MediaStore::expect($kind, $id, null);
            $key = $record->newQuery()->whereKey($id)->lockForUpdate()->value($kind->column());
            $record->setAttribute($kind->column(), is_string($key) ? $key : null);
        });

        // Las versiones, después del commit: si el borrado se deshace, el
        // registro sigue con su imagen.
        static::deleted(function (Model $record): void {
            $kind = static::mediaKind();
            $key = $record->getAttribute($kind->column());

            DB::afterCommit(fn () => MediaStore::delete(is_string($key) ? $key : null, $kind));
        });
    }

    /**
     * La imagen publicada: `src` y `srcset`, o null.
     *
     * @return array{src: string, srcset: string}|null
     */
    public function publishedImage(): ?array
    {
        $kind = static::mediaKind();
        $key = $this->getAttribute($kind->column());

        return MediaStore::published(is_string($key) ? $key : null, $kind);
    }
}
