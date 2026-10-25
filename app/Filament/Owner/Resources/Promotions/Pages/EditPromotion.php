<?php

namespace App\Filament\Owner\Resources\Promotions\Pages;

use App\Filament\Owner\Resources\Promotions\PromotionResource;
use App\Filament\Owner\Support\EditOwnerRecord;

class EditPromotion extends EditOwnerRecord
{
    protected static string $resource = PromotionResource::class;
}
