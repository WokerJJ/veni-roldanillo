<?php

namespace App\Filament\Owner\Resources\Dishes\Pages;

use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateDish extends CreateOwnerRecord
{
    protected static string $resource = DishResource::class;

    protected function getRedirectUrl(): string
    {
        // Al editarlo se le agregan los grupos de opciones.
        return DishResource::getUrl('edit', ['record' => $this->getRecord()]);
    }
}
