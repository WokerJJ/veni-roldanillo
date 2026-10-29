<?php

namespace App\Jobs\Search;

use App\Jobs\SyncRestaurantDishes;
use Laravel\Scout\Jobs\MakeSearchable as ScoutMakeSearchable;

/**
 * El trabajo de Scout que sube platos al índice (#17, ADR 0029), con las
 * esperas entre intentos de SyncRestaurantDishes: si Meilisearch se reinicia,
 * los tres intentos del worker no se gastan en el mismo segundo.
 */
class MakeSearchable extends ScoutMakeSearchable
{
    /**
     * Segundos de espera antes de cada reintento (un método: Scout tipa la
     * propiedad como entero).
     *
     * @return list<int>
     */
    public function backoff(): array
    {
        return SyncRestaurantDishes::BACKOFF;
    }
}
