<?php

namespace App\Actions\Restaurants;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Descarta un borrador de OpenStreetMap que en la calle no existe o no se va
 * a publicar (#58, ADR 0021 y 0027): sigue oculto, y la importación ya no lo
 * actualiza, no lo lista para verificar ni lo marca como ido. La usan
 * `veni:osm-dismiss` y el panel de administración. Descartar dos veces no
 * cambia la fecha del primero.
 */
final class DismissOsmDraft
{
    /**
     * @throws ActionRefused
     */
    public function handle(Restaurant $restaurant): void
    {
        DB::transaction(function () use ($restaurant): void {
            $locked = Restaurant::query()->lockForUpdate()->whereKey($restaurant->getKey())->firstOrFail();
            $source = $locked->source()->first();

            if ($source === null || $source->source !== RestaurantSource::OPENSTREETMAP) {
                throw new ActionRefused(ActionRefused::NOT_FROM_OSM);
            }

            if ($locked->status !== RestaurantStatus::Hidden) {
                throw new ActionRefused(ActionRefused::PUBLISHED);
            }

            if ($source->dismissed_at === null) {
                $source->forceFill(['dismissed_at' => Carbon::now()])->save();
            }
        });
    }
}
