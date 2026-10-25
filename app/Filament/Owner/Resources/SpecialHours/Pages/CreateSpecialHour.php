<?php

namespace App\Filament\Owner\Resources\SpecialHours\Pages;

use App\Filament\Owner\Resources\SpecialHours\SpecialHourResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateSpecialHour extends CreateOwnerRecord
{
    protected static string $resource = SpecialHourResource::class;
}
