<?php

namespace App\Filament\Owner\Support;

use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\OwnerResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Editar desde el panel del dueño: el registro llega filtrado por el
 * restaurante de la dirección y autorizado por RestaurantContentPolicy;
 * guardar o borrar mueve «Actualizada el…».
 */
abstract class EditOwnerRecord extends EditRecord
{
    use TouchesOwnerUpdate, TranslatesConstraintViolations;

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        return $this->writeRespectingConstraints(fn (): Model => parent::handleRecordUpdate($record, $data));
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        return $this->ownerResource()::mutateFormData($data);
    }

    protected function afterSave(): void
    {
        $this->touchOwnerUpdate();
    }

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make()->after(fn () => $this->touchOwnerUpdate()),
        ];
    }

    protected function constraintErrorField(): string
    {
        return $this->ownerResource()::constraintErrorField();
    }

    protected function getRedirectUrl(): string
    {
        return $this->ownerResource()::getUrl('index');
    }

    /**
     * El recurso del panel del dueño de esta página, con su tipo.
     *
     * @return class-string<OwnerResource>
     */
    private function ownerResource(): string
    {
        $resource = static::getResource();

        if (! is_subclass_of($resource, OwnerResource::class)) {
            throw new LogicException("{$resource} no es un recurso del panel del dueño.");
        }

        return $resource;
    }
}
