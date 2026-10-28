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
 * Las reglas son las de RestaurantStatusRules: exige que esté verificada en
 * la calle, o que quien la publica lo registre ($verifiedNow guarda la fecha
 * de ahora); una ficha descartada o con un retiro aprobado no se publica.
 * Queda reclamada si ya tiene dueño y, si no, sin reclamar. La fila se lee
 * bloqueada: dos publicaciones a la vez no pisan una a la otra.
 *
 * No autoriza: lo hace quien la llama (la Policy en el panel; la consola es
 * de quien opera el servidor).
 */
final class PublishRestaurant
{
    /**
     * @throws ActionRefused
     */
    public function handle(Restaurant $restaurant, bool $verifiedNow = false): RestaurantStatus
    {
        return DB::transaction(function () use ($restaurant, $verifiedNow): RestaurantStatus {
            $locked = Restaurant::query()->lockForUpdate()->whereKey($restaurant->getKey())->firstOrFail();

            if ($locked->status->isPublished()) {
                throw new ActionRefused(ActionRefused::ALREADY_PUBLISHED);
            }

            $status = $locked->owners()->exists() ? RestaurantStatus::Claimed : RestaurantStatus::Unclaimed;

            RestaurantStatusRules::assert($locked, $status, verified: $locked->verified_at !== null || $verifiedNow);

            $locked->forceFill([
                'status' => $status,
                'verified_at' => $locked->verified_at ?? Carbon::now(),
            ])->save();

            $restaurant->setRawAttributes($locked->getAttributes(), sync: true);

            return $status;
        });
    }
}
