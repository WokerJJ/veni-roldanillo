<?php

namespace App\Enums;

/**
 * Qué es un grupo de opciones de un plato (#14, ADR 0023).
 *
 * - Choice: elegir entre opciones, obligatorio o no según min_choices (la
 *   proteína, las adiciones con recargo).
 * - Removal: ingredientes que se pueden quitar («sin cebolla»). Nunca es
 *   obligatorio y quitar no cambia el precio.
 */
enum OptionGroupKind: string
{
    case Choice = 'choice';
    case Removal = 'removal';
}
