<?php

namespace App\Filament\Owner\Resources\DeliveryZones\Pages;

use App\Filament\Owner\Resources\DeliveryZones\DeliveryZoneResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreateDeliveryZone extends CreateOwnerRecord
{
    protected static string $resource = DeliveryZoneResource::class;
}
