<?php

namespace App\Filament\Admin\Resources\Catalog\Pages;

use App\Filament\Admin\Resources\Catalog\CatalogItemResource;
use Filament\Resources\Pages\CreateRecord;

class CreateCatalogItem extends CreateRecord
{
    protected static string $resource = CatalogItemResource::class;

    protected function getRedirectUrl(): string
    {
        return CatalogItemResource::getUrl('index');
    }
}
