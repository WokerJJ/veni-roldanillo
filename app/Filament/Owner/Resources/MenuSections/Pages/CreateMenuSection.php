<?php

namespace App\Filament\Owner\Resources\MenuSections\Pages;

use App\Filament\Owner\Resources\MenuSections\MenuSectionResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateMenuSection extends CreateOwnerRecord
{
    protected static string $resource = MenuSectionResource::class;
}
