<?php

use App\Filament\Admin\Auth\Login as AdminLogin;
use App\Filament\Auth\EditProfile;
use App\Filament\Owner\Auth\Login as OwnerLogin;
use App\Models\Restaurant;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Las cuentas de los paneles (#19, ADR 0025 y 0027): el correo es la llave
 * de la cuenta y no se cambia desde el perfil; la contraseña temporal se
 * cambia al primer ingreso; el login no deja bloquear una cuenta desde
 * cualquier IP.
 */
test('el perfil no deja cambiar el correo, en ninguno de los dos paneles', function (string $panel) {
    $user = $panel === 'admin'
        ? User::factory()->admin()->create(['email' => 'cuenta@example.test'])
        : tap(panelMember(Restaurant::factory()->claimed()->create()), fn (User $u) => $u->forceFill(['email' => 'cuenta@example.test'])->save());
    $this->actingAs($user);
    Filament::setCurrentPanel(Filament::getPanel($panel));

    Livewire::test(EditProfile::class)
        ->assertFormFieldIsDisabled('email')
        ->fillForm(['email' => 'otra@example.test'])
        ->call('save');

    expect($user->fresh()?->email)->toBe('cuenta@example.test');
})->with(['owner', 'admin']);

test('el correo se guarda en minúsculas y la base no deja dos cuentas que solo difieren en mayúsculas', function () {
    $user = User::factory()->create(['email' => '  Duena@Example.TEST ']);

    expect($user->fresh()?->email)->toBe('duena@example.test');

    expect(fn () => DB::table('users')->insert([
        'name' => 'Otra', 'email' => 'DUENA@example.test', 'password' => 'x', 'role' => 'user',
        'created_at' => now(), 'updated_at' => now(),
    ]))->toThrow(QueryException::class, 'users_email_lower_unique');
});

test('un dueño con la contraseña temporal va primero a cambiarla; al cambiarla, entra a su panel', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $owner->forceFill(['must_change_password' => true, 'password' => 'temporal-de-prueba'])->save();

    $this->actingAs($owner)->get("/panel/{$restaurant->slug}")->assertRedirect('/panel/profile');
    $this->actingAs($owner)->get('/panel/profile')->assertOk();

    Filament::setCurrentPanel(Filament::getPanel('owner'));
    Livewire::test(EditProfile::class)
        ->fillForm(['password' => 'una-clave-nueva-larga', 'passwordConfirmation' => 'una-clave-nueva-larga', 'currentPassword' => 'temporal-de-prueba'])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($owner->fresh()?->must_change_password)->toBeFalse();
    // Una sesión nueva: la de la prueba guarda el hash de la contraseña vieja (AuthenticateSession).
    $this->flushSession();
    $this->actingAs($owner->fresh())->get("/panel/{$restaurant->slug}")->assertOk();
});

test('el tope por cuenta cuenta por cuenta e IP: desde otra IP la cuenta sigue entrando', function () {
    $key = fn (string $email, string $ip): string => AdminLogin::accountRateLimitKey($email, $ip);

    foreach (range(1, AdminLogin::MAX_ATTEMPTS_PER_ACCOUNT) as $attempt) {
        RateLimiter::hit($key(' Admin@Example.test', '203.0.113.10'), AdminLogin::ACCOUNT_DECAY_SECONDS);
    }

    expect(RateLimiter::tooManyAttempts($key('admin@example.test', '203.0.113.10'), AdminLogin::MAX_ATTEMPTS_PER_ACCOUNT))->toBeTrue()
        ->and(RateLimiter::tooManyAttempts($key('admin@example.test', '198.51.100.20'), AdminLogin::MAX_ATTEMPTS_PER_ACCOUNT))->toBeFalse()
        ->and(OwnerLogin::accountRateLimitKey('admin@example.test', '203.0.113.10'))->not->toBe($key('admin@example.test', '203.0.113.10'));
});

test('el bloqueo de una cuenta de administración queda en el registro, sin el correo ni la IP', function () {
    Log::spy();
    $admin = User::factory()->admin()->create(['email' => 'admin@example.test']);
    Filament::setCurrentPanel(Filament::getPanel('admin'));

    foreach (range(1, AdminLogin::MAX_ATTEMPTS_PER_ACCOUNT) as $attempt) {
        Livewire::test(AdminLogin::class)->fillForm(['email' => 'admin@example.test', 'password' => 'mala'])->call('authenticate');
        if ($attempt % 5 === 0) {
            $this->travel(61)->seconds();
        }
    }

    Log::shouldHaveReceived('warning')->once()->withArgs(function (string $message, array $context) use ($admin): bool {
        $logged = $message.json_encode($context);

        return ($context['user_id'] ?? null) === $admin->id
            && ! str_contains($logged, 'admin@example.test')
            && ! str_contains($logged, '127.0.0.1');
    });
});
