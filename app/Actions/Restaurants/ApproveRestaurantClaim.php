<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimStatus;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Aprueba un reclamo «¿Es tu negocio?» (ADR 0026 y 0027), todo en una sola
 * transacción:
 *
 * 1. crea la cuenta del dueño con el correo que confirmó administración y una
 *    contraseña temporal (o vincula la cuenta que ya tenga ese correo);
 * 2. la enlaza en restaurant_claims.user_id y marca quién y cuándo revisó;
 * 3. pasa la ficha a «reclamada»;
 * 4. la hace dueña en restaurant_user (si era empleada, sube a dueña).
 *
 * Si algo falla, no queda nada a medias. El reclamo y la ficha se leen
 * bloqueados: dos aprobaciones a la vez (dos reclamos de la misma ficha)
 * terminan con un solo dueño, y la segunda se rechaza (NOT_CLAIMABLE).
 * No se manda correo: no hay correo saliente; la contraseña la entrega
 * administración por el celular que dejó la persona.
 */
final class ApproveRestaurantClaim
{
    /** Largo de la contraseña temporal. */
    public const TEMPORARY_PASSWORD_LENGTH = 16;

    /**
     * @throws ActionRefused
     * @throws AuthorizationException
     */
    public function handle(RestaurantClaim $claim, User $reviewer, string $email): ApprovedClaim
    {
        if (! $reviewer->isAdmin()) {
            throw new AuthorizationException;
        }

        $email = mb_strtolower(trim($email));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 254) {
            throw new ActionRefused(ActionRefused::INVALID_EMAIL);
        }

        return DB::transaction(function () use ($claim, $reviewer, $email): ApprovedClaim {
            $locked = RestaurantClaim::query()->lockForUpdate()->whereKey($claim->getKey())->firstOrFail();

            if ($locked->status !== ClaimStatus::Pending) {
                throw new ActionRefused(ActionRefused::NOT_PENDING);
            }

            $restaurant = Restaurant::query()->lockForUpdate()->whereKey($locked->restaurant_id)->firstOrFail();

            if (! $restaurant->isClaimable() || $restaurant->owners()->exists()) {
                throw new ActionRefused(ActionRefused::NOT_CLAIMABLE);
            }

            [$owner, $password] = $this->ownerAccount($email, $locked, $restaurant);

            $locked->forceFill([
                'user_id' => $owner->getKey(),
                'status' => ClaimStatus::Approved,
                'reviewed_by' => $reviewer->getKey(),
                'reviewed_at' => now(),
            ])->save();

            $restaurant->forceFill(['status' => RestaurantStatus::Claimed])->save();
            $restaurant->members()->syncWithoutDetaching([
                $owner->id => ['role' => RestaurantRole::Owner->value],
            ]);

            $claim->setRawAttributes($locked->getAttributes(), sync: true);

            return new ApprovedClaim($owner, $password);
        });
    }

    /**
     * La cuenta que ya tiene ese correo o una nueva con contraseña temporal.
     * Una cuenta de administración no se vuelve dueña: los roles van aparte.
     *
     * @return array{User, string|null}
     */
    private function ownerAccount(string $email, RestaurantClaim $claim, Restaurant $restaurant): array
    {
        $existing = User::query()->whereRaw('lower(email) = ?', [$email])->lockForUpdate()->first();

        if ($existing !== null) {
            if ($existing->isAdmin()) {
                throw new ActionRefused(ActionRefused::ADMIN_ACCOUNT);
            }

            return [$existing, null];
        }

        $password = Str::password(self::TEMPORARY_PASSWORD_LENGTH, symbols: false);

        $owner = User::query()->create([
            'name' => $claim->contact_name ?? $restaurant->name,
            'email' => $email,
            'password' => $password,
        ]);

        return [$owner, $password];
    }
}
