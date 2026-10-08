<?php

namespace App\Enums;

/** Estado de la ficha: sin reclamar, reclamada por su dueño u oculta. */
enum RestaurantStatus: string
{
    case Unclaimed = 'unclaimed';
    case Claimed = 'claimed';
    case Hidden = 'hidden';

    /**
     * Estados que se muestran en el sitio público. Se nombran los que se
     * publican, no el que se oculta: un estado nuevo no sale hasta sumarlo aquí.
     *
     * @return list<self>
     */
    public static function published(): array
    {
        return [self::Unclaimed, self::Claimed];
    }

    public function isPublished(): bool
    {
        return in_array($this, self::published(), true);
    }
}
