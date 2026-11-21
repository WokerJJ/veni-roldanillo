<?php

namespace App\Filament\Admin\Widgets;

use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Support\MenuFreshness;

/**
 * Frescura de los menús: quién mantiene su carta o su «Almuerzo de hoy» al
 * día y quién la dejó. Muestra los SHOWN más viejos y dice cuántos hay.
 */
class MenuFreshnessWidget extends AdminWidget
{
    /** Cuántas filas se muestran; el resto se resume en una línea. */
    public const SHOWN = 25;

    /** Desde cuántos días sin tocar se marca la fila como «sin actualizar». */
    public const STALE_DAYS = 7;

    protected static ?int $sort = 2;

    protected string $view = 'filament.admin.widgets.menu-freshness';

    /**
     * @return array{rows: list<object>, total: int, stale: int}
     */
    public function freshness(): array
    {
        $all = MenuFreshness::rows();

        return [
            'rows' => array_slice($all, 0, self::SHOWN),
            'total' => count($all),
            'stale' => count(array_filter($all, fn (object $row) => $row->days === null || $row->days >= self::STALE_DAYS)),
        ];
    }

    public function restaurantUrl(int $id): ?string
    {
        return RestaurantResource::canAccess() ? RestaurantResource::getUrl('edit', ['record' => $id]) : null;
    }
}
