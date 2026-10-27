<?php

namespace App\Filament\Owner\Resources\Promotions\Pages;

use App\Filament\Owner\Resources\Promotions\PromotionResource;
use App\Filament\Owner\Support\CreateOwnerRecord;

class CreatePromotion extends CreateOwnerRecord
{
    protected static string $resource = PromotionResource::class;
}
