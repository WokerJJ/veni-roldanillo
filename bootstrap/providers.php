<?php

use App\Providers\AppServiceProvider;
use App\Providers\Filament\AdminPanelProvider;
use App\Providers\Filament\OwnerPanelProvider;

return [
    AppServiceProvider::class,
    OwnerPanelProvider::class,
    AdminPanelProvider::class,
];
