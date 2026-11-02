<?php

namespace App\Actions\Media;

use App\Enums\MediaKind;
use App\Support\Media\MediaStore;
use Illuminate\Support\Facades\DB;

/**
 * Quita la imagen de un registro (#113, ADR 0034, AUD-018): descarta lo que
 * esté en la cola, deja la columna en null y borra las versiones de lo que
 * había después del commit (si la transacción se deshace, la ficha no queda
 * con una imagen rota).
 *
 * La columna se lee con la fila bloqueada, como la lee el trabajo al
 * publicar: si el trabajo publicó otra mientras tanto, se borra esa y no la
 * que mostraba la página. La escritura es directa: no mueve updated_at (el
 * panel lo usa para avisar de ediciones en otra pestaña) ni reindexa.
 *
 * Devuelve la clave que quitó, o null si no había ninguna. No autoriza: lo
 * hace quien la llama.
 */
final class RemoveMediaImage
{
    public function handle(MediaKind $kind, int $recordId): ?string
    {
        $model = $kind->model();
        $column = $kind->column();

        return DB::transaction(function () use ($kind, $recordId, $model, $column): ?string {
            $row = $model::query()->whereKey($recordId)->lockForUpdate()->first([$column]);
            // Con la fila bloqueada: un trabajo que esté publicando ya pasó
            // su revisión y escribió, o la hace después y ya no es el suyo.
            MediaStore::expect($kind, $recordId, null);

            $current = $row?->getAttribute($column);

            if (! is_string($current)) {
                return null;
            }

            $model::query()->whereKey($recordId)->toBase()->update([$column => null]);
            DB::afterCommit(fn () => MediaStore::delete($current, $kind));

            return $current;
        });
    }
}
