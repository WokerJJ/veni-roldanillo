<?php

namespace App\Filament\Admin\Resources\Catalog\Pages;

use App\Filament\Admin\Resources\Catalog\CatalogItemResource;
use Filament\Resources\Pages\EditRecord;

class EditCatalogItem extends EditRecord
{
    protected static string $resource = CatalogItemResource::class;

    protected function getRedirectUrl(): string
    {
        return CatalogItemResource::getUrl('index');
    }
}
