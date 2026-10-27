<?php

namespace App\Actions\Restaurants;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Publica una ficha oculta (ADR 0021 y 0027): la usan `veni:publish` y el
 * panel de administración (borradores de OpenStreetMap y «mostrar»).
 *
 * Exige que esté verificada en la calle, o que quien la publica lo registre
 * ($verifiedNow guarda la fecha de ahora). Una ficha descartada no se
 * publica. Queda reclamada si ya tiene dueño y, si no, sin reclamar. La fila
 * se lee bloqueada: dos publicaciones a la vez no pisan una a la otra.
 */
final class PublishRestaurant
{
    /**
     * @throws ActionRefused
     */
    public function handle(Restaurant $restaurant, bool $verifiedNow = false): RestaurantStatus
    {
        return DB::transaction(function () use ($restaurant, $verifiedNow): RestaurantStatus {
            $locked = Restaurant::query()->lockForUpdate()->findOrFail($restaurant->getKey());
            $locked->load('source');

            if ($locked->status->isPublished()) {
                throw new ActionRefused(ActionRefused::ALREADY_PUBLISHED);
            }

            if ($locked->source?->dismissed_at !== null) {
                throw new ActionRefused(ActionRefused::DISMISSED);
            }

            if ($locked->verified_at === null && ! $verifiedNow) {
                throw new ActionRefused(ActionRefused::NOT_VERIFIED);
            }

            $status = $locked->owners()->exists() ? RestaurantStatus::Claimed : RestaurantStatus::Unclaimed;

            $locked->forceFill([
                'status' => $status,
                'verified_at' => $locked->verified_at ?? Carbon::now(),
            ])->save();

            $restaurant->setRawAttributes($locked->getAttributes(), sync: true);

            return $status;
        });
    }
}
