<?php

namespace App\Filament\Admin\Resources\Removals\Pages;

use App\Filament\Admin\Resources\Removals\RemovalRequestResource;
use Filament\Resources\Pages\ListRecords;

class ListRemovalRequests extends ListRecords
{
    protected static string $resource = RemovalRequestResource::class;
}
