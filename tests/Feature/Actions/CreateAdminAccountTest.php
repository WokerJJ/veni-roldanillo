<?php

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Users\CreateAdminAccount;
use App\Enums\UserRole;
use App\Models\Restaurant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

/*
| La primera cuenta de administración en producción (veni:make-admin, ADR
| 0027): una cuenta por correo sin distinguir mayúsculas, temporal, y nada
| más que la cuenta.
*/

uses(RefreshDatabase::class);

const ADMIN_TEST_PHRASE = 'una frase corriente de prueba';

it('crea la cuenta de administración con contraseña temporal', function () {
    $admin = app(CreateAdminAccount::class)->handle('  Ana.Admin@Example.test ', '  Ana Admin ', ADMIN_TEST_PHRASE);

    $stored = User::query()->findOrFail($admin->id);

    expect($stored->email)->toBe('ana.admin@example.test')
        ->and($stored->name)->toBe('Ana Admin')
        ->and($stored->role)->toBe(UserRole::Admin)
        ->and($stored->must_change_password)->toBeTrue()
        ->and($stored->password)->not->toBe(ADMIN_TEST_PHRASE)
        ->and(Hash::check(ADMIN_TEST_PHRASE, $stored->password))->toBeTrue();
});

it('crea solo la cuenta pedida', function () {
    User::factory()->create();
    $before = User::query()->count();

    app(CreateAdminAccount::class)->handle('ana@example.test', 'Ana', ADMIN_TEST_PHRASE);

    expect(User::query()->count())->toBe($before + 1)
        ->and(Restaurant::query()->count())->toBe(0)
        ->and(User::query()->where('role', UserRole::Admin->value)->count())->toBe(1);
});

it('rechaza un correo que ya tiene cuenta, en otras mayúsculas también, sin tocarla', function () {
    $owner = User::factory()->create(['email' => 'Dueno@Example.test', 'name' => 'Dueña']);

    expect(fn () => app(CreateAdminAccount::class)->handle('dueno@example.test', 'Ana', ADMIN_TEST_PHRASE))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::ACCOUNT_EXISTS);

    $owner->refresh();

    expect($owner->role)->toBe(UserRole::User)
        ->and($owner->name)->toBe('Dueña')
        ->and(User::query()->count())->toBe(1);
});

it('rechaza un correo que ya es de administración', function () {
    User::factory()->create(['email' => 'ana@example.test'])->forceFill(['role' => UserRole::Admin])->save();

    expect(fn () => app(CreateAdminAccount::class)->handle('ANA@example.test', 'Ana', ADMIN_TEST_PHRASE))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::ADMIN_ACCOUNT);
});

it('rechaza los datos inválidos sin crear nada', function (string $email, string $name, string $password, string $reason) {
    expect(fn () => app(CreateAdminAccount::class)->handle($email, $name, $password))
        ->toThrow(fn (ActionRefused $e) => $e->reason === $reason);

    expect(User::query()->count())->toBe(0);
})->with([
    'correo sin arroba' => ['no-es-correo', 'Ana', ADMIN_TEST_PHRASE, ActionRefused::INVALID_EMAIL],
    'correo vacío' => ['', 'Ana', ADMIN_TEST_PHRASE, ActionRefused::INVALID_EMAIL],
    'nombre vacío' => ['ana@example.test', '   ', ADMIN_TEST_PHRASE, ActionRefused::INVALID_NAME],
    'nombre con salto de línea' => ['ana@example.test', "Ana\nAdmin", ADMIN_TEST_PHRASE, ActionRefused::INVALID_NAME],
    'nombre larguísimo' => ['ana@example.test', str_repeat('a', 121), ADMIN_TEST_PHRASE, ActionRefused::INVALID_NAME],
    'contraseña corta' => ['ana@example.test', 'Ana', 'corta-123', ActionRefused::WEAK_PASSWORD],
    'contraseña de espacios' => ['ana@example.test', 'Ana', str_repeat(' ', 14), ActionRefused::WEAK_PASSWORD],
    'un solo carácter repetido' => ['ana@example.test', 'Ana', str_repeat('a', 14), ActionRefused::WEAK_PASSWORD],
    'contraseña que bcrypt truncaría' => ['ana@example.test', 'Ana', str_repeat('a', 73), ActionRefused::WEAK_PASSWORD],
]);
