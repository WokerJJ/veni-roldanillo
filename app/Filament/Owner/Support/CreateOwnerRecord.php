<?php

namespace App\Filament\Owner\Support;

use App\Filament\Owner\Concerns\ResolvesOwnerResource;
use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Crear desde el panel del dueño: el registro queda colgado del restaurante
 * de la dirección (Filament lo asocia por la relación) y mueve «Actualizada
 * el…».
 */
abstract class CreateOwnerRecord extends CreateRecord
{
    use ResolvesOwnerResource, TouchesOwnerUpdate, TranslatesConstraintViolations;

    protected static bool $canCreateAnother = false;

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordCreation(array $data): Model
    {
        return $this->writeRespectingConstraints(fn (): Model => parent::handleRecordCreation($data));
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        return $this->ownerResource()::mutateFormData($data);
    }

    protected function afterCreate(): void
    {
        $this->touchOwnerUpdate();
    }

    protected function constraintErrorField(?string $constraint): ?string
    {
        return $this->ownerResource()::constraintErrorField();
    }

    protected function getRedirectUrl(): string
    {
        return $this->ownerResource()::getUrl('index');
    }
}
