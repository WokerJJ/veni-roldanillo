<?php

namespace App\Policies;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\User;

/**
 * Regla de producto 5: un dueño solo edita su restaurante; el administrador
 * puede todo. La pertenencia se consulta en la base de datos, nunca se toma
 * de IDs que manda el cliente.
 */
class RestaurantPolicy
{
    public function viewAny(?User $user): bool
    {
        return true;
    }

    /**
     * Las fichas ocultas solo las ven un administrador y la gente del restaurante.
     */
    public function view(?User $user, Restaurant $restaurant): bool
    {
        if ($restaurant->status !== RestaurantStatus::Hidden) {
            return true;
        }

        return $user !== null && ($user->isAdmin() || $user->worksAt($restaurant));
    }

    /**
     * Las fichas las crea un administrador; los dueños las reclaman.
     */
    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, Restaurant $restaurant): bool
    {
        return $user->isAdmin() || $user->ownsRestaurant($restaurant);
    }

    /**
     * Borrar es solo del administrador (el dueño pide el retiro de la ficha).
     * Sin restore ni forceDelete: no hay borrado lógico (para retirar una
     * ficha sin borrarla está el estado hidden).
     */
    public function delete(User $user, Restaurant $restaurant): bool
    {
        return $user->isAdmin();
    }
}
