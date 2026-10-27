<?php

namespace App\Filament\Owner\Resources\OpeningHours\Pages;

use App\Filament\Owner\Resources\OpeningHours\OpeningHourResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListOpeningHours extends ListOwnerRecords
{
    protected static string $resource = OpeningHourResource::class;
}
