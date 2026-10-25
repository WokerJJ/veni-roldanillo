<?php

namespace App\Filament\Owner\Resources\Dishes\Pages;

use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Support\EditOwnerRecord;

class EditDish extends EditOwnerRecord
{
    protected static string $resource = DishResource::class;
}
