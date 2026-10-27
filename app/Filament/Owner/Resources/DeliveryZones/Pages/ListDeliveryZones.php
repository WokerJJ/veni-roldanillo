<?php

namespace App\Filament\Owner\Resources\DeliveryZones\Pages;

use App\Filament\Owner\Resources\DeliveryZones\DeliveryZoneResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListDeliveryZones extends ListOwnerRecords
{
    protected static string $resource = DeliveryZoneResource::class;
}
