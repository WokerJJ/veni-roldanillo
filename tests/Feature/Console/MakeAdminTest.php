<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
| veni:make-admin: la contraseña se pide en un campo secreto, dos veces; no
| va en un argumento ni se imprime.
*/

uses(RefreshDatabase::class);

const MAKE_ADMIN_PASSWORD = 'contrasena-de-prueba-1'; // gitleaks:allow
const MAKE_ADMIN_CONFIRM = 'Vas a crear una cuenta con acceso total a /admin en producción. ¿Seguís?';

it('crea la cuenta preguntando el nombre y la contraseña', function () {
    $this->artisan('veni:make-admin', ['email' => 'Ana@Example.test'])
        ->expectsQuestion('Nombre de la persona', 'Ana Admin')
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->doesntExpectOutputToContain(MAKE_ADMIN_PASSWORD)
        ->expectsOutputToContain('Administración creada: ana@example.test')
        ->assertSuccessful();

    $admin = User::query()->where('email', 'ana@example.test')->firstOrFail();

    expect($admin->role)->toBe(UserRole::Admin)
        ->and($admin->name)->toBe('Ana Admin')
        ->and($admin->must_change_password)->toBeTrue();
});

it('no pregunta el nombre si viene en --name', function () {
    $this->artisan('veni:make-admin', ['email' => 'ana@example.test', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->assertSuccessful();

    expect(User::query()->where('email', 'ana@example.test')->value('name'))->toBe('Ana');
});

it('no crea nada si las contraseñas no coinciden', function () {
    $this->artisan('veni:make-admin', ['email' => 'ana@example.test', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', 'otra-contrasena-distinta')
        ->expectsOutputToContain('no coinciden')
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('rechaza un correo que ya tiene cuenta y no la toca', function () {
    $owner = User::factory()->create(['email' => 'ana@example.test']);

    $this->artisan('veni:make-admin', ['email' => 'ANA@example.test', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->expectsOutputToContain('ya tiene una cuenta')
        ->assertFailed();

    expect($owner->refresh()->role)->toBe(UserRole::User)
        ->and(User::query()->count())->toBe(1);
});

it('rechaza un correo inválido y una contraseña corta', function (string $email, string $password, string $message) {
    $this->artisan('veni:make-admin', ['email' => $email, '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', $password)
        ->expectsQuestion('Repetí la contraseña', $password)
        ->expectsOutputToContain($message)
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
})->with([
    'correo inválido' => ['no-es-correo', MAKE_ADMIN_PASSWORD, 'El correo no es válido'],
    'contraseña corta' => ['ana@example.test', 'corta', 'entre 12 y 72'],
]);

it('en producción pide confirmación y, si se niega, no hace nada', function () {
    app()['env'] = 'production';

    $this->artisan('veni:make-admin', ['email' => 'ana@example.test', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->expectsConfirmation(MAKE_ADMIN_CONFIRM, 'no')
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('en producción crea la cuenta tras confirmar', function () {
    app()['env'] = 'production';

    $this->artisan('veni:make-admin', ['email' => 'ana@example.test', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->expectsConfirmation(MAKE_ADMIN_CONFIRM, 'yes')
        ->assertSuccessful();

    expect(User::query()->where('email', 'ana@example.test')->exists())->toBeTrue();
});

it('en producción, --force omite la confirmación', function () {
    app()['env'] = 'production';

    $this->artisan('veni:make-admin', ['email' => 'ana@example.test', '--name' => 'Ana', '--force' => true])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->assertSuccessful();
});

it('en producción no pregunta la confirmación si los datos ya son inválidos', function () {
    app()['env'] = 'production';

    $this->artisan('veni:make-admin', ['email' => 'no-es-correo', '--name' => 'Ana'])
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', MAKE_ADMIN_PASSWORD)
        ->expectsQuestion('Repetí la contraseña', MAKE_ADMIN_PASSWORD)
        ->expectsOutputToContain('El correo no es válido')
        ->assertFailed();
});
