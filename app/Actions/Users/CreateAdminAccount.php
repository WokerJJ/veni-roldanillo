<?php

namespace App\Actions\Users;

use App\Actions\Restaurants\ActionRefused;
use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Crea una cuenta de administración (users.role = admin), la primera de un
 * despliegue: PanelAdminSeeder solo corre en local y testing, y el panel no
 * crea administradores (ADR 0027). La llama `php artisan veni:make-admin`.
 *
 * - Una cuenta por correo sin distinguir mayúsculas, como el índice único de
 *   lower(email): si ya hay una cuenta, se rechaza (ACCOUNT_EXISTS o
 *   ADMIN_ACCOUNT), nunca se la vuelve administradora en silencio.
 * - La contraseña es la que entrega quien la crea y queda marcada como
 *   temporal (users.must_change_password): el primer ingreso a /admin pide
 *   cambiarla. Esta acción no la guarda ni la devuelve en claro.
 * - Crea solo la cuenta: ningún restaurante, ni membresía, ni más usuarios.
 */
final class CreateAdminAccount
{
    public const NAME_MAX = 120;

    public const PASSWORD_MIN = 12;

    /** El mismo máximo que bcrypt: más allá, la contraseña se trunca. */
    public const PASSWORD_MAX = 72;

    /**
     * Los datos, sin tocar la base: la consola los valida antes de pedir la
     * confirmación, para no hacer confirmar algo que se va a rechazar.
     *
     * @throws ActionRefused
     */
    public function validate(string $email, string $name, string $password): void
    {
        $email = mb_strtolower(trim($email));
        $name = trim($name);

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 254) {
            throw new ActionRefused(ActionRefused::INVALID_EMAIL);
        }

        if ($name === '' || mb_strlen($name) > self::NAME_MAX || preg_match('/[\x00-\x1F\x7F]/u', $name) === 1) {
            throw new ActionRefused(ActionRefused::INVALID_NAME);
        }

        // Ni corta, ni que bcrypt trunque, ni en blanco, ni un solo carácter repetido.
        if (mb_strlen($password) < self::PASSWORD_MIN || strlen($password) > self::PASSWORD_MAX
            || trim($password) === '' || preg_match('/^(.)\1*$/su', $password) === 1) {
            throw new ActionRefused(ActionRefused::WEAK_PASSWORD);
        }
    }

    /**
     * @throws ActionRefused
     */
    public function handle(string $email, string $name, string $password): User
    {
        $this->validate($email, $name, $password);

        $email = mb_strtolower(trim($email));
        $name = trim($name);

        return DB::transaction(function () use ($email, $name, $password): User {
            $this->refuseExistingAccount($email);

            // role y must_change_password no son asignables en masa.
            $admin = new User(['name' => $name, 'email' => $email, 'password' => $password]);
            $admin->forceFill(['role' => UserRole::Admin, 'must_change_password' => true]);

            try {
                // En un savepoint: si otro proceso crea el mismo correo a la
                // vez, el índice único frena el insert y se rechaza igual.
                DB::transaction(fn (): bool => $admin->save());
            } catch (UniqueConstraintViolationException $exception) {
                $this->refuseExistingAccount($email);

                throw $exception;
            }

            return $admin;
        });
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
