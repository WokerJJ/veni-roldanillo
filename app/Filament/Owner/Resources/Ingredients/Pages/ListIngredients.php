<?php

namespace App\Filament\Owner\Resources\Ingredients\Pages;

use App\Filament\Owner\Resources\Ingredients\IngredientResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListIngredients extends ListOwnerRecords
{
    protected static string $resource = IngredientResource::class;
}
