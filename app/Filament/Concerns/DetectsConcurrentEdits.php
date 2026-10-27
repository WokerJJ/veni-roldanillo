<?php

namespace App\Filament\Concerns;

use Carbon\CarbonInterface;
use Filament\Notifications\Notification;
use Filament\Support\Exceptions\Halt;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Livewire\Attributes\Locked;

/**
 * Control optimista al guardar (AUD-016, ADR 0027), en los dos paneles: el
 * formulario recuerda el updated_at del registro al abrirse y, al guardar,
 * lo compara con el de la base leído bloqueado (FOR UPDATE, dentro de la
 * misma transacción que escribe). Si cambió (otra pestaña, el dueño y
 * administración a la vez), no pisa: avisa y no guarda nada. Recargar trae
 * lo nuevo.
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
        $this->rememberVersion();
    }

    /** Lee la versión de la base: también después de guardar, para seguir editando. */
    protected function rememberVersion(): void
    {
        $this->loadedVersion = $this->storedVersion(lock: false);
    }

    /**
     * Llamar dentro de la transacción que guarda: si otra persona guardó
     * después de abrir el formulario, avisa y corta (Halt revierte).
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

        throw new Halt;
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

        $value = $query->value($column);

        return match (true) {
            $value instanceof CarbonInterface => $value->toImmutable()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            is_string($value) => Carbon::parse($value)->utc()->format('Y-m-d\TH:i:s.u\Z'),
            default => null,
        };
    }
}
