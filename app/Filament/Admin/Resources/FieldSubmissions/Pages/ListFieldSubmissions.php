<?php

namespace App\Filament\Admin\Resources\FieldSubmissions\Pages;

use App\Filament\Admin\Resources\FieldSubmissions\FieldSubmissionResource;
use Filament\Resources\Pages\ListRecords;

class ListFieldSubmissions extends ListRecords
{
    protected static string $resource = FieldSubmissionResource::class;
}
