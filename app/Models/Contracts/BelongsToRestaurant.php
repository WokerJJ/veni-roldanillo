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
     * Consulta la base siguiendo las FK guardadas; no usa relaciones ya
     * cargadas en memoria, que podrían haberse manipulado.
     */
    public function owningRestaurant(): Restaurant;
}
