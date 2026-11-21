<?php

namespace App\Filament\Admin\Widgets;

use App\Filament\Admin\Resources\Claims\RestaurantClaimResource;
use App\Filament\Admin\Resources\FieldSubmissions\FieldSubmissionResource;
use App\Filament\Admin\Resources\Removals\RemovalRequestResource;
use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Support\CatalogOverview;

/**
 * Estado del catálogo: fichas publicadas, ocultas y reclamadas, y las
 * solicitudes que esperan una decisión, cada una con su enlace al recurso.
 * El enlace solo aparece si el recurso deja entrar a esta persona.
 */
class CatalogStatusWidget extends AdminWidget
{
    protected static ?int $sort = 1;

    protected string $view = 'filament.admin.widgets.catalog-status';

    public function overview(): CatalogOverview
    {
        return CatalogOverview::current();
    }

    /**
     * @return array<string, string|null>
     */
    public function links(): array
    {
        return [
            'restaurants' => RestaurantResource::canAccess() ? RestaurantResource::getUrl('index') : null,
            'claims' => RestaurantClaimResource::canAccess() ? RestaurantClaimResource::getUrl('index') : null,
            'removals' => RemovalRequestResource::canAccess() ? RemovalRequestResource::getUrl('index') : null,
            'field' => FieldSubmissionResource::canAccess() ? FieldSubmissionResource::getUrl('index') : null,
        ];
    }
}
