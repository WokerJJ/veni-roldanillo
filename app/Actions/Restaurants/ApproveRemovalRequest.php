<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimStatus;
use App\Models\Restaurant;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

/**
 * Aprueba un pedido de retiro (ADR 0026 y 0027): en una sola transacción,
 * oculta la ficha (HideRestaurant: deja el mapa y su página responde 404) y
 * marca quién y cuándo lo revisó. No borra la ficha ni a su dueño.
 */
final class ApproveRemovalRequest
{
    public function __construct(private readonly HideRestaurant $hide) {}

    /**
     * @throws ActionRefused
     * @throws AuthorizationException
     */
    public function handle(RestaurantRemovalRequest $removal, User $reviewer): void
    {
        if (! $reviewer->isAdmin()) {
            throw new AuthorizationException;
        }

        DB::transaction(function () use ($removal, $reviewer): void {
            $locked = RestaurantRemovalRequest::query()->lockForUpdate()->whereKey($removal->getKey())->firstOrFail();

            if ($locked->status !== ClaimStatus::Pending) {
                throw new ActionRefused(ActionRefused::NOT_PENDING);
            }

            $this->hide->handle(Restaurant::query()->whereKey($locked->restaurant_id)->firstOrFail());

            $locked->forceFill([
                'status' => ClaimStatus::Approved,
                'reviewed_by' => $reviewer->getKey(),
                'reviewed_at' => now(),
            ])->save();

            $removal->setRawAttributes($locked->getAttributes(), sync: true);
        });
    }
}
