<?php

namespace App\Enums;

/** Rol de un usuario dentro de un restaurante. */
enum RestaurantRole: string
{
    case Owner = 'owner';
    case Staff = 'staff';
}
