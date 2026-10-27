<?php

namespace App\Actions\Restaurants;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use Illuminate\Support\Facades\DB;

/**
 * Oculta una ficha (#19, ADR 0027): deja de salir en el mapa y su página
 * responde 404, como una que no existe. No borra nada: el dueño, el menú y
 * las solicitudes siguen, y «mostrar» (PublishRestaurant) la vuelve a
 * publicar. La usan la moderación y la aprobación de un retiro.
 */
final class HideRestaurant
{
    public function handle(Restaurant $restaurant): void
    {
        DB::transaction(function () use ($restaurant): void {
            $locked = Restaurant::query()->lockForUpdate()->whereKey($restaurant->getKey())->firstOrFail();

            if ($locked->status !== RestaurantStatus::Hidden) {
                $locked->forceFill(['status' => RestaurantStatus::Hidden])->save();
            }

            $restaurant->setRawAttributes($locked->getAttributes(), sync: true);
        });
    }
}
