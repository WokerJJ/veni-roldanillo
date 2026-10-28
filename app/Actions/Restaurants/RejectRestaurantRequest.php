<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimStatus;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

/**
 * Rechaza un reclamo o un pedido de retiro con su motivo (ADR 0027): la
 * ficha no cambia. El motivo es para administración (no se publica) y se va
 * con la solicitud a los seis meses (ADR 0026).
 */
final class RejectRestaurantRequest
{
    public const NOTE_MAX = 500;

    /**
     * @throws ActionRefused
     * @throws AuthorizationException
     */
    public function handle(RestaurantClaim|RestaurantRemovalRequest $request, User $reviewer, string $note): void
    {
        if (! $reviewer->isAdmin()) {
            throw new AuthorizationException;
        }

        // Sin espacios a los lados, también los de Unicode (como el panel del dueño).
        $note = (string) preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', $note);

        if ($note === '' || mb_strlen($note) > self::NOTE_MAX) {
            throw new ActionRefused(ActionRefused::MISSING_NOTE);
        }

        DB::transaction(function () use ($request, $reviewer, $note): void {
            $locked = $request->newQuery()->lockForUpdate()->whereKey($request->getKey())->firstOrFail();

            if ($locked->getAttribute('status') !== ClaimStatus::Pending) {
                throw new ActionRefused(ActionRefused::NOT_PENDING);
            }

            $locked->forceFill([
                'status' => ClaimStatus::Rejected,
                'reviewed_by' => $reviewer->getKey(),
                'reviewed_at' => now(),
                'review_note' => $note,
            ])->save();

            $request->setRawAttributes($locked->getAttributes(), sync: true);
        });
    }
}
