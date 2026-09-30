<?php

namespace App\Models;

use App\Enums\RestaurantRole;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Pertenencia de un usuario a un restaurante (dueño o empleado).
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP.
 *
 * @property RestaurantRole $role
 */
class RestaurantUser extends Pivot
{
    protected $table = 'restaurant_user';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => RestaurantRole::class,
        ];
    }
}
