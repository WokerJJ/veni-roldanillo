<?php

namespace App\Enums;

/** Estado de la ficha: sin reclamar, reclamada por su dueño u oculta. */
enum RestaurantStatus: string
{
    case Unclaimed = 'unclaimed';
    case Claimed = 'claimed';
    case Hidden = 'hidden';
}
