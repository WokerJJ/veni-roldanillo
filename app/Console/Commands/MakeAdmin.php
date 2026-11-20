<?php

namespace App\Console\Commands;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Users\CreateAdminAccount;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Crea la primera cuenta de administración desde la consola (ADR 0027): en
 * producción nadie más puede, porque el panel no crea administradores y el
 * seeder de ejemplo solo corre en local. La contraseña se pide con un campo
 * secreto, dos veces: no va en un argumento (quedaría en el historial del
 * shell y en la lista de procesos) ni se imprime. Queda como temporal: el
 * primer ingreso a /admin obliga a cambiarla.
 */
#[Signature('veni:make-admin
    {email : El correo de la cuenta de administración}
    {--name= : El nombre; si falta, se pregunta}
    {--force : No pedir confirmación en producción}')]
#[Description('Crea una cuenta de administración (la primera, en producción)')]
class MakeAdmin extends Command
{
    public function handle(CreateAdminAccount $create): int
    {
        /** @var string $email */
        $email = $this->argument('email');
        $name = $this->option('name');

        // Solo en producción, y --force lo omite (para un despliegue automatizado).
        if ($this->laravel->environment('production') && ! $this->option('force')
            && ! $this->components->confirm('Vas a crear una cuenta con acceso total a /admin en producción. ¿Seguís?', false)) {
            $this->components->warn('Cancelado. No se creó nada.');

            return self::FAILURE;
        }

        if (! is_string($name) || trim($name) === '') {
            $asked = $this->components->ask('Nombre de la persona');
            $name = is_string($asked) ? $asked : '';
        }

        $password = $this->components->secret('Contraseña (mínimo '.CreateAdminAccount::PASSWORD_MIN.' caracteres)');
        $repeated = $this->components->secret('Repetí la contraseña');

        if (! is_string($password) || $password !== $repeated) {
            $this->components->error('Las contraseñas no coinciden. No se creó nada.');

            return self::FAILURE;
        }

        try {
            $admin = $create->handle($email, $name, $password);
        } catch (ActionRefused $refused) {
            $this->components->error(match ($refused->reason) {
                ActionRefused::INVALID_EMAIL => 'El correo no es válido.',
                ActionRefused::INVALID_NAME => 'El nombre está vacío, es muy largo o tiene caracteres de control.',
                ActionRefused::WEAK_PASSWORD => 'La contraseña tiene que medir entre '.CreateAdminAccount::PASSWORD_MIN.' y '.CreateAdminAccount::PASSWORD_MAX.' caracteres.',
                ActionRefused::ADMIN_ACCOUNT => 'Ese correo ya es de una cuenta de administración.',
                default => 'Ese correo ya tiene una cuenta; no se vincula en silencio (ADR 0027). Usá otro correo.',
            }.' No se creó nada.');

            return self::FAILURE;
        }

        $this->components->info("Administración creada: {$admin->email}. Al entrar a /admin tiene que cambiar la contraseña.");

        return self::SUCCESS;
    }
}
