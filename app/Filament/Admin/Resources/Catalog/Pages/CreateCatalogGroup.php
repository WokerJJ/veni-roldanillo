<?php

namespace App\Filament\Admin\Resources\Catalog\Pages;

use App\Filament\Admin\Resources\Catalog\CatalogGroupResource;
use Filament\Resources\Pages\CreateRecord;

class CreateCatalogGroup extends CreateRecord
{
    protected static string $resource = CatalogGroupResource::class;

    protected function getRedirectUrl(): string
    {
        return CatalogGroupResource::getUrl('index');
    }
}
