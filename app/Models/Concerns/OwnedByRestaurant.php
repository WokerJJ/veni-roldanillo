<?php

namespace App\Models\Concerns;

use App\Models\Restaurant;

/**
 * owningRestaurant() (BelongsToRestaurant) del contenido que cuelga directo
 * de un restaurante por restaurant_id.
 *
 * Usa la relación ya cargada solo si apunta a la FK guardada en la base
 * (getOriginal): así una tabla que la carga con with('restaurant') autoriza
 * todas sus filas sin una consulta por fila, y un restaurant_id cambiado en
 * memoria, o una relación puesta a mano que apunte a otro restaurante, no
 * engañan a la Policy: en esos casos se consulta la base.
 */
trait OwnedByRestaurant
{
    public function owningRestaurant(): Restaurant
    {
        $loaded = $this->relationLoaded('restaurant') ? $this->getRelation('restaurant') : null;

        if ($loaded instanceof Restaurant && $loaded->exists && $loaded->getKey() === $this->getOriginal('restaurant_id')) {
            return $loaded;
        }

        return $this->restaurant()->firstOrFail();
    }
}
