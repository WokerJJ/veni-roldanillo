<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimStatus;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;

/**
 * Las reglas del estado de una ficha (#19, ADR 0027), en un solo lugar: las
 * usan PublishRestaurant, ApproveRestaurantClaim, la ficha de
 * administración (RestaurantResource::persist) y los datos de ejemplo.
 * Quien la llama le pasa la ficha leída bloqueada (FOR UPDATE, dentro de su
 * transacción) o una nueva sin guardar, y el estado al que va.
 *
 * - «reclamada» exige un dueño y «sin reclamar», que no lo tenga;
 * - pasar a publicada desde oculta (o nacer publicada) exige que esté
 *   verificada en la calle, que no sea un borrador descartado de
 *   OpenStreetMap y que no tenga un retiro aprobado (ADR 0026: la ficha
 *   retirada no vuelve sola; si el negocio quiere volver, lo pide de nuevo).
 *
 * Una ficha que ya está publicada puede seguir publicada sin verificar: la
 * verificación se exige al publicar, no se revisa en cada cambio (las
 * fichas sembradas y las que entraron antes del panel no la tienen).
 * Ocultar siempre se puede.
 */
final class RestaurantStatusRules
{
    /**
     * @throws ActionRefused
     */
    public static function assert(Restaurant $restaurant, RestaurantStatus $target, bool $verified): void
    {
        if ($target === RestaurantStatus::Hidden) {
            return;
        }

        $hasOwner = $restaurant->exists && $restaurant->owners()->exists();

        if ($target === RestaurantStatus::Claimed && ! $hasOwner) {
            throw new ActionRefused(ActionRefused::CLAIMED_NEEDS_OWNER);
        }

        if ($target === RestaurantStatus::Unclaimed && $hasOwner) {
            throw new ActionRefused(ActionRefused::UNCLAIMED_HAS_OWNER);
        }

        if ($restaurant->exists && $restaurant->status->isPublished()) {
            return;
        }

        if ($restaurant->exists && $restaurant->source()->whereNotNull('dismissed_at')->exists()) {
            throw new ActionRefused(ActionRefused::DISMISSED);
        }

        if ($restaurant->exists && $restaurant->removalRequests()->where('status', ClaimStatus::Approved->value)->exists()) {
            throw new ActionRefused(ActionRefused::REMOVED);
        }

        if (! $verified) {
            throw new ActionRefused(ActionRefused::NOT_VERIFIED);
        }
    }
}
