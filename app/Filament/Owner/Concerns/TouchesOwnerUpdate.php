<?php

namespace App\Filament\Owner\Concerns;

use App\Filament\Owner\OwnerResource;

/**
 * «Actualizada el…» de la ficha (restaurants.updated_by_owner_at): cada
 * cambio que el dueño guarda desde el panel la mueve (#18, ADR 0025).
 */
trait TouchesOwnerUpdate
{
    protected function touchOwnerUpdate(): void
    {
        OwnerResource::currentRestaurant()?->touchOwnerUpdate();
    }
}
