<?php

namespace App\Filament\Admin\Resources\Claims\Pages;

use App\Filament\Admin\Resources\Claims\RestaurantClaimResource;
use Filament\Resources\Pages\ListRecords;

class ListRestaurantClaims extends ListRecords
{
    protected static string $resource = RestaurantClaimResource::class;
}
