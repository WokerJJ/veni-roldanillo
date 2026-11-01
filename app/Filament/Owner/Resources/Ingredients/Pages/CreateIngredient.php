<?php

namespace App\Filament\Owner\Resources\Ingredients\Pages;

use App\Filament\Owner\Resources\Ingredients\IngredientResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateIngredient extends CreateOwnerRecord
{
    protected static string $resource = IngredientResource::class;
}
