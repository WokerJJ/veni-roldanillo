<?php

namespace App\Filament\Owner\Concerns;

use App\Models\Restaurant;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Gate;

/**
 * Las páginas propias del panel del dueño (Hoy, Mi carta, Estadísticas)
 * trabajan siempre sobre el restaurante de la dirección: el tenant, que
 * Filament ya comprobó que es de esta persona, autorizado además con la
 * habilidad de RestaurantPolicy que pide cada página (tenantAbility()).
 * Nunca con un id que venga del navegador.
 */
trait ResolvesOwnerTenant
{
    public static function canAccess(): bool
    {
        $restaurant = Filament::getTenant();

        return $restaurant instanceof Restaurant && Gate::allows(static::tenantAbility(), $restaurant);
    }

    /** La habilidad de RestaurantPolicy que abre la página. */
    protected static function tenantAbility(): string
    {
        return 'update';
    }

    /** El restaurante de la dirección, ya autorizado (404 sin tenant, 403 sin permiso). */
    protected function restaurant(): Restaurant
    {
        $restaurant = Filament::getTenant();
        abort_unless($restaurant instanceof Restaurant, 404);
        Gate::authorize(static::tenantAbility(), $restaurant);

        return $restaurant;
    }
}
