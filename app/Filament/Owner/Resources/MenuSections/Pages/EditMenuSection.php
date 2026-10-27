<?php

namespace App\Filament\Owner\Resources\MenuSections\Pages;

use App\Filament\Owner\Resources\MenuSections\MenuSectionResource;
use App\Filament\Owner\Support\EditOwnerRecord;

class EditMenuSection extends EditOwnerRecord
{
    protected static string $resource = MenuSectionResource::class;
}
