<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;

/**
 * Cuenta de ejemplo para entrar al panel de administración (/admin, ADR 0027)
 * en desarrollo, con la contraseña conocida PASSWORD (documentada en el
 * README, como la de PanelOwnerSeeder). Es ficticia, del dominio reservado
 * example.test, y FictitiousSeeder impide sembrarla fuera de local o
 * testing. Nunca es una contraseña real.
 *
 * Solo agrega: si la cuenta ya existe no la toca (tampoco le cambia el rol
 * ni la contraseña). Se puede correr sola en una base ya sembrada:
 *
 *     php artisan db:seed --class=PanelAdminSeeder
 */
class PanelAdminSeeder extends FictitiousSeeder
{
    /** Contraseña de ejemplo, solo para desarrollo. */
    public const PASSWORD = 'veni-admin-dev';

    public const EMAIL = 'panel.admin@example.test';

    protected function populate(): void
    {
        if (User::query()->where('email', self::EMAIL)->exists()) {
            return;
        }

        $admin = new User(['name' => 'Administración del Panel (ficticio)', 'email' => self::EMAIL, 'password' => self::PASSWORD]);
        // role no es asignable en masa: nadie se vuelve administrador por un formulario.
        $admin->forceFill(['role' => UserRole::Admin])->save();
    }
}
