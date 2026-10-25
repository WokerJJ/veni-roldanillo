<?php

namespace App\Filament\Owner\Resources\OpeningHours\Pages;

use App\Filament\Owner\Resources\OpeningHours\OpeningHourResource;
use App\Filament\Owner\Support\EditOwnerRecord;

class EditOpeningHour extends EditOwnerRecord
{
    protected static string $resource = OpeningHourResource::class;
}
