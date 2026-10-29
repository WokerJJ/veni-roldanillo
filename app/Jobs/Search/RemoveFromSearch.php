<?php

namespace App\Jobs\Search;

use App\Jobs\SyncRestaurantDishes;
use Laravel\Scout\Jobs\RemoveFromSearch as ScoutRemoveFromSearch;

/** El trabajo de Scout que saca platos del índice, con las mismas esperas que MakeSearchable. */
class RemoveFromSearch extends ScoutRemoveFromSearch
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
