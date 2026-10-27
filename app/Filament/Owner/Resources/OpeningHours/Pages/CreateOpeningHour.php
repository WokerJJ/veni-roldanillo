<?php

namespace App\Filament\Owner\Resources\OpeningHours\Pages;

use App\Filament\Owner\Resources\OpeningHours\OpeningHourResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateOpeningHour extends CreateOwnerRecord
{
    protected static string $resource = OpeningHourResource::class;
}
