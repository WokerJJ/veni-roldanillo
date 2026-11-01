<?php

namespace App\Models\Concerns;

use App\Enums\MediaKind;
use App\Support\Media\MediaStore;
use Illuminate\Database\Eloquent\Model;

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
        static::deleted(function (Model $record): void {
            $kind = static::mediaKind();
            $key = $record->getAttribute($kind->column());

            MediaStore::delete(is_string($key) ? $key : null, $kind);
            $id = $record->getKey();

            if (is_int($id)) {
                MediaStore::expect($kind, $id, null);
            }
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
