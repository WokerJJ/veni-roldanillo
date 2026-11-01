<?php

namespace App\Filament\Owner\Support;

use App\Filament\Owner\Concerns\HandlesMediaUpload;
use App\Filament\Owner\Concerns\ResolvesOwnerResource;
use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Contracts\ReceivesMediaUploads;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Crear desde el panel del dueño: el registro queda colgado del restaurante
 * de la dirección (Filament lo asocia por la relación) y mueve «Actualizada
 * el…». La imagen del registro, si el recurso la tiene, la aplica
 * HandlesMediaUpload.
 */
abstract class CreateOwnerRecord extends CreateRecord implements ReceivesMediaUploads
{
    use HandlesMediaUpload, ResolvesOwnerResource, TouchesOwnerUpdate, TranslatesConstraintViolations;

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
        return $this->ownerResource()::mutateFormData($this->pullMediaState($data));
    }

    protected function afterCreate(): void
    {
        $record = $this->getRecord();

        if ($record !== null) {
            $this->applyMediaState($record);
        }

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
