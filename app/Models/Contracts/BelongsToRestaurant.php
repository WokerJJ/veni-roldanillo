<?php

namespace App\Models\Contracts;

use App\Models\Restaurant;

/**
 * Contenido que cuelga de un restaurante (menú, horarios, promociones,
 * domicilios). RestaurantContentPolicy autoriza con el restaurante que
 * devuelve este método.
 */
interface BelongsToRestaurant
{
    /**
     * Sigue las FK guardadas en la base (getOriginal): usa una relación ya
     * cargada solo si apunta a esa FK y, si no, consulta la base. Un cambio
     * en memoria de la FK o de la relación no cambia la respuesta.
     */
    public function owningRestaurant(): Restaurant;
}
