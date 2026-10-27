<?php

namespace App\Policies;

use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;

/**
 * Reclamos y pedidos de retiro (#20, ADR 0026 y 0027): los ve y los resuelve
 * solo administración. Se crean desde el formulario público, sin cuenta (no
 * pasan por aquí), y no se borran a mano: la limpieza los borra o anonimiza
 * a los seis meses (PrunedAfterReview).
 */
class RestaurantRequestPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, RestaurantClaim|RestaurantRemovalRequest $request): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return false;
    }

    /** Aprobar o rechazar. */
    public function update(User $user, RestaurantClaim|RestaurantRemovalRequest $request): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, RestaurantClaim|RestaurantRemovalRequest $request): bool
    {
        return false;
    }

    public function deleteAny(User $user): bool
    {
        return false;
    }
}
