<?php

namespace Database\Seeders;

use App\Enums\RestaurantRole;
use App\Models\Restaurant;
use App\Models\User;

/**
 * Cuentas de ejemplo para entrar al panel del dueño (/panel, ADR 0025) en
 * desarrollo. A diferencia de UserSeeder, llevan una contraseña conocida
 * (PASSWORD, documentada en el README): son cuentas ficticias del dominio
 * reservado example.test y FictitiousSeeder impide sembrarlas fuera de local
 * o testing. Nunca es una contraseña real.
 *
 * Solo agrega: crea las cuentas que falten y las vincula con los dos
 * primeros restaurantes ficticios; no borra ni cambia nada de lo que ya
 * existe. Se puede correr sola en una base ya sembrada:
 *
 *     php artisan db:seed --class=PanelOwnerSeeder
 *
 * - panel.duena: dueña del primer restaurante ficticio.
 * - panel.otro: dueño del segundo (para ver que uno no entra al del otro).
 * - panel.empleado: empleado del primero (los empleados no entran al panel).
 */
class PanelOwnerSeeder extends FictitiousSeeder
{
    /** Contraseña de ejemplo, solo para desarrollo. */
    public const PASSWORD = 'veni-panel-dev';

    public const OWNER_EMAIL = 'panel.duena@example.test';

    public const OTHER_OWNER_EMAIL = 'panel.otro@example.test';

    public const STAFF_EMAIL = 'panel.empleado@example.test';

    protected function populate(): void
    {
        $restaurants = Restaurant::query()->where('is_fictitious', true)->orderBy('id')->limit(2)->get();

        $first = $restaurants->first();
        $second = $restaurants->get(1);

        if ($first === null || $second === null) {
            return;
        }

        $accounts = [
            [self::OWNER_EMAIL, 'Dueña del Panel (ficticio)', $first, RestaurantRole::Owner],
            [self::OTHER_OWNER_EMAIL, 'Otro Dueño del Panel (ficticio)', $second, RestaurantRole::Owner],
            [self::STAFF_EMAIL, 'Empleado del Panel (ficticio)', $first, RestaurantRole::Staff],
        ];

        foreach ($accounts as [$email, $name, $restaurant, $role]) {
            $user = User::query()->firstOrCreate(
                ['email' => $email],
                ['name' => $name, 'password' => self::PASSWORD],
            );

            if (! $restaurant->members()->whereKey($user->getKey())->exists()) {
                $restaurant->members()->attach($user, ['role' => $role->value]);
            }
        }
    }
}
