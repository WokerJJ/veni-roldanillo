<?php

namespace App\Filament\Owner\Resources\MenuSections\Pages;

use App\Filament\Owner\Resources\MenuSections\MenuSectionResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListMenuSections extends ListOwnerRecords
{
    protected static string $resource = MenuSectionResource::class;
}
