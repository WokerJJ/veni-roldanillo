<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimStatus;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Aprueba un reclamo «¿Es tu negocio?» (ADR 0026 y 0027), todo en una sola
 * transacción:
 *
 * 1. crea la cuenta del dueño con el correo que confirmó administración y una
 *    contraseña temporal, que tendrá que cambiar al primer ingreso
 *    (users.must_change_password);
 * 2. la enlaza en restaurant_claims.user_id y marca quién y cuándo revisó;
 * 3. la hace dueña en restaurant_user;
 * 4. pasa la ficha a «reclamada» (RestaurantStatusRules).
 *
 * Si ya hay una cuenta con ese correo (sin distinguir mayúsculas), no la
 * vincula: quien escribe un correo ajeno en el formulario público se
 * quedaría con la ficha a nombre de esa cuenta, y quien conoce el correo de
 * un dueño, con su cuenta. Se rechaza (ACCOUNT_EXISTS) y administración
 * sigue el procedimiento manual del ADR 0027.
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

            $restaurant->members()->syncWithoutDetaching([
                $owner->id => ['role' => RestaurantRole::Owner->value],
            ]);
            RestaurantStatusRules::assert($restaurant, RestaurantStatus::Claimed, verified: $restaurant->verified_at !== null);
            $restaurant->forceFill(['status' => RestaurantStatus::Claimed])->save();

            $claim->setRawAttributes($locked->getAttributes(), sync: true);

            return new ApprovedClaim($owner, $password);
        });
    }

    /**
     * Una cuenta nueva con contraseña temporal. Si el correo ya tiene cuenta
     * se rechaza: ADMIN_ACCOUNT si es de administración (los roles van
     * aparte) y ACCOUNT_EXISTS si no. Si otra aprobación la crea a la vez
     * (el índice único de lower(email) frena el insert), se busca una vez más
     * y se rechaza igual, en vez de terminar en un error 500.
     *
     * @return array{User, string}
     *
     * @throws ActionRefused
     */
    private function ownerAccount(string $email, RestaurantClaim $claim, Restaurant $restaurant): array
    {
        $this->refuseExistingAccount($email);

        $password = Str::password(self::TEMPORARY_PASSWORD_LENGTH, symbols: false);
        $owner = new User([
            'name' => $claim->contact_name ?? $restaurant->name,
            'email' => $email,
            'password' => $password,
        ]);
        $owner->forceFill(['must_change_password' => true]);

        try {
            // En un savepoint: si el insert choca, la transacción de afuera sigue viva.
            DB::transaction(fn (): bool => $owner->save());
        } catch (UniqueConstraintViolationException $exception) {
            $this->refuseExistingAccount($email);

            throw $exception;
        }

        return [$owner, $password];
    }

    /**
     * @throws ActionRefused
     */
    private function refuseExistingAccount(string $email): void
    {
        $existing = User::query()->whereRaw('lower(email) = ?', [$email])->lockForUpdate()->first();

        if ($existing !== null) {
            throw new ActionRefused($existing->isAdmin() ? ActionRefused::ADMIN_ACCOUNT : ActionRefused::ACCOUNT_EXISTS);
        }
    }
}
