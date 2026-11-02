<?php

namespace App\Filament\Owner\Support;

use App\Filament\Concerns\DetectsConcurrentEdits;
use App\Filament\Owner\Concerns\HandlesMediaUpload;
use App\Filament\Owner\Concerns\ResolvesOwnerResource;
use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Contracts\ReceivesMediaUploads;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Editar desde el panel del dueño: el registro llega filtrado por el
 * restaurante de la dirección y autorizado por RestaurantContentPolicy;
 * guardar o borrar mueve «Actualizada el…». Si otra pestaña guardó el
 * mismo registro después de abrirlo, no se pisa (DetectsConcurrentEdits).
 * Si la base no deja borrar (una sección con platos), el dueño ve un aviso y
 * el registro sigue. La imagen del registro, si el recurso la tiene, la
 * aplica HandlesMediaUpload.
 */
abstract class EditOwnerRecord extends EditRecord implements ReceivesMediaUploads
{
    use DetectsConcurrentEdits, HandlesMediaUpload, ResolvesOwnerResource, TouchesOwnerUpdate, TranslatesConstraintViolations;

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        return $this->writeRespectingConstraints(fn (): Model => parent::handleRecordUpdate($record, $data));
    }

    protected function beforeSave(): void
    {
        $this->guardAgainstConcurrentEdit();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        return $this->ownerResource()::mutateFormData($this->pullMediaState($data));
    }

    protected function afterSave(): void
    {
        $this->applyMediaState($this->getRecord());
        $this->touchOwnerUpdate();
        $this->rememberVersion($this->getRecord());
    }

    protected function versionedRecord(): Model
    {
        return $this->getRecord();
    }

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make()
                ->using(function (Model $record): bool {
                    $deleted = $this->deleteRespectingConstraints($record);

                    if ($deleted) {
                        $this->touchOwnerUpdate();
                    }

                    return $deleted;
                })
                ->failureNotificationTitle(__('panel.errors.delete_blocked')),
        ];
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
