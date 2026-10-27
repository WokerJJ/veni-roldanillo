<?php

namespace App\Filament\Owner\Resources\SpecialHours\Pages;

use App\Filament\Owner\Resources\SpecialHours\SpecialHourResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListSpecialHours extends ListOwnerRecords
{
    protected static string $resource = SpecialHourResource::class;
}
