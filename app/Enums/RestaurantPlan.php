<?php

namespace App\Enums;

/** Plan de la ficha; lo pagado se marca «Patrocinado» y nunca oculta reseñas. */
enum RestaurantPlan: string
{
    case Free = 'free';
    case Featured = 'featured';
}
