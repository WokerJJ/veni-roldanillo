<?php

namespace App\Policies;

use App\Models\Contracts\BelongsToRestaurant;
use App\Models\Restaurant;
use App\Models\User;

/**
 * Policy común del contenido de un restaurante (secciones, platos, opciones,
 * almuerzos del día, promociones, horarios y zonas de domicilio). Delega en
 * RestaurantPolicy: quien puede editar la ficha edita su contenido, y el
 * contenido se ve si la ficha se ve. Una sola clase en vez de nueve iguales;
 * cada modelo la declara con #[UsePolicy].
 *
 * Crear recibe el restaurante de la ruta, nunca un restaurant_id del cliente:
 * Gate::authorize('create', [Dish::class, $restaurant]).
 */
class RestaurantContentPolicy
{
    public function __construct(private readonly RestaurantPolicy $restaurants) {}

    public function view(?User $user, BelongsToRestaurant $content): bool
    {
        return $this->restaurants->view($user, $content->owningRestaurant());
    }

    public function create(User $user, Restaurant $restaurant): bool
    {
        return $this->restaurants->update($user, $restaurant);
    }

    public function update(User $user, BelongsToRestaurant $content): bool
    {
        return $this->restaurants->update($user, $content->owningRestaurant());
    }

    public function delete(User $user, BelongsToRestaurant $content): bool
    {
        return $this->restaurants->update($user, $content->owningRestaurant());
    }
}
