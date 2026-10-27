<?php

namespace App\Filament\Owner\Resources\Promotions\Pages;

use App\Filament\Owner\Resources\Promotions\PromotionResource;
use App\Filament\Owner\Support\ListOwnerRecords;

class ListPromotions extends ListOwnerRecords
{
    protected static string $resource = PromotionResource::class;
}
