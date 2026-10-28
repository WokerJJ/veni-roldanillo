<?php

namespace App\Filament\Concerns;

use Carbon\CarbonInterface;
use Closure;
use Filament\Notifications\Notification;
use Filament\Support\Exceptions\Halt;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Locked;

/**
 * Control optimista al guardar (AUD-016, ADR 0027), en los dos paneles: el
 * formulario recuerda el updated_at del registro al abrirse y, al guardar,
 * lo compara con el de la base leído bloqueado (FOR UPDATE). Si cambió (otra
 * pestaña, el dueño y administración a la vez), no pisa: avisa y no guarda
 * nada. Recargar trae lo nuevo.
 *
 * Quien lo usa llama a guardAgainstConcurrentEdit() en beforeSave(): los dos
 * paneles guardan cada formulario en una transacción (databaseTransactions())
 * y el Halt la revierte entera, también las relaciones que Filament guarda
 * aparte (las categorías de una ficha). Después de guardar, la versión que
 * se recuerda es la del modelo que se escribió en esa transacción, no una
 * relectura posterior que podría traer el cambio de otro.
 *
 * La versión es una propiedad bloqueada de Livewire (#[Locked]): el
 * navegador no la puede cambiar. La resolución es la de updated_at (segundos):
 * dos guardados en el mismo segundo no se distinguen.
 */
trait DetectsConcurrentEdits
{
    /** updated_at del registro cuando se abrió (o se guardó) el formulario. */
    #[Locked]
    public ?string $loadedVersion = null;

    /** El registro que edita el formulario. */
    abstract protected function versionedRecord(): Model;

    protected function afterFill(): void
    {
        $this->loadedVersion = $this->storedVersion(lock: false);
    }

    /** Recuerda la versión del modelo que se acaba de escribir. */
    protected function rememberVersion(Model $written): void
    {
        $this->loadedVersion = self::versionOf($written->getAttribute((string) $written->getUpdatedAtColumn()));
    }

    /**
     * Llamar en beforeSave(), dentro de la transacción del formulario: si
     * otra persona guardó después de abrirlo, avisa y corta (el Halt revierte
     * la transacción).
     */
    protected function guardAgainstConcurrentEdit(): void
    {
        if ($this->storedVersion(lock: true) === $this->loadedVersion) {
            return;
        }

        Notification::make()
            ->danger()
            ->title(__('panel.errors.conflict'))
            ->body(__('panel.errors.conflict_body'))
            ->persistent()
            ->send();

        throw (new Halt)->rollBackDatabaseTransaction();
    }

    /**
     * Escribe algo aparte del formulario en el mismo registro (el aviso de
     * demora) sin tragarse un cambio ajeno: si nadie más guardó desde que se
     * abrió el formulario, la versión recordada pasa a la nueva; si alguien
     * guardó, queda la vieja y el próximo guardado del formulario avisa.
     *
     * @param  Closure(): Model  $write  devuelve el modelo escrito
     */
    protected function writeBesideForm(Closure $write): void
    {
        DB::transaction(function () use ($write): void {
            $unchanged = $this->storedVersion(lock: true) === $this->loadedVersion;
            $written = $write();

            if ($unchanged) {
                $this->rememberVersion($written);
            }
        });
    }

    private function storedVersion(bool $lock): ?string
    {
        $record = $this->versionedRecord();
        $column = $record->getUpdatedAtColumn();

        if ($column === null) {
            return null;
        }

        $query = $record->newQuery()->whereKey($record->getKey());

        if ($lock) {
            $query->lockForUpdate();
        }

        return self::versionOf($query->value($column));
    }

    private static function versionOf(mixed $value): ?string
    {
        return match (true) {
            $value instanceof CarbonInterface => $value->toImmutable()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            is_string($value) => Carbon::parse($value)->utc()->format('Y-m-d\TH:i:s.u\Z'),
            default => null,
        };
    }
}
