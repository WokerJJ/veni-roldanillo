<?php

namespace App\Filament\Owner\Support;

use App\Filament\Owner\OwnerResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

abstract class ListOwnerRecords extends ListRecords
{
    protected function getHeaderActions(): array
    {
        // Crear se autoriza con el restaurante de la dirección
        // (OwnerResource::canCreate), no solo con la clase del modelo.
        return [CreateAction::make()->authorize(function (): bool {
            $resource = static::getResource();

            return is_subclass_of($resource, OwnerResource::class) && $resource::canCreate();
        })];
    }
}
