<?php

namespace App\Filament\Owner\Auth;

use App\Models\User;
use DanHarrin\LivewireRateLimiting\Exceptions\TooManyRequestsException;
use Filament\Auth\Http\Responses\Contracts\LoginResponse;
use Filament\Auth\Pages\Login as FilamentLogin;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Login del panel del dueño (ADR 0025): el de Filament, que limita a cinco
 * intentos por minuto por IP, más un límite por cuenta e IP: quien prueba
 * claves contra un mismo correo se detiene aunque espere el minuto.
 *
 * La cuenta de intentos es por correo y por IP, no solo por correo: con un
 * tope global por correo, cualquiera que conozca el correo de
 * administración la bloquearía desde su casa, y la dueña legítima tampoco
 * podría entrar desde la suya (#19). Probar desde muchas IP sigue frenado
 * por el tope de cada IP. Cuando una cuenta de administración llega al
 * tope, queda en el registro (con su id; sin el correo ni la IP).
 *
 * Cuentan los intentos fallidos contra el correo escrito (en minúsculas y sin
 * espacios), exista o no la cuenta: la respuesta es la misma y no revela qué
 * correos tienen cuenta. Entrar bien borra la cuenta de intentos.
 *
 * El login de administración (#19) es esta misma clase con otro prefijo.
 *
 * Está fuera de app/Filament/Owner/Pages para que discoverPages no la
 * registre como una página más del panel.
 */
class Login extends FilamentLogin
{
    public const MAX_ATTEMPTS_PER_ACCOUNT = 10;

    public const ACCOUNT_DECAY_SECONDS = 15 * 60;

    /** Prefijo de la clave del límite por cuenta: cada panel cuenta aparte. */
    protected const string RATE_LIMIT_PREFIX = 'owner-panel-login';

    public function authenticate(): ?LoginResponse
    {
        $email = $this->data['email'] ?? '';
        $email = is_string($email) ? $email : '';
        $key = static::accountRateLimitKey($email, request()->ip());

        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS_PER_ACCOUNT)) {
            $this->getRateLimitedNotification(new TooManyRequestsException(
                static::class, 'authenticate', request()->ip(), RateLimiter::availableIn($key),
            ))?->send();

            return null;
        }

        try {
            $response = parent::authenticate();
        } catch (ValidationException $exception) {
            if (RateLimiter::hit($key, self::ACCOUNT_DECAY_SECONDS) === self::MAX_ATTEMPTS_PER_ACCOUNT) {
                self::logBlockedAdmin($email);
            }

            throw $exception;
        }

        if ($response !== null) {
            RateLimiter::clear($key);
        }

        return $response;
    }

    /** La clave del límite por cuenta e IP de este panel. */
    public static function accountRateLimitKey(string $email, ?string $ip): string
    {
        return static::RATE_LIMIT_PREFIX.':'.hash('sha256', mb_strtolower(trim($email)).'|'.($ip ?? ''));
    }

    private static function logBlockedAdmin(string $email): void
    {
        $user = User::query()->whereRaw('lower(email) = ?', [mb_strtolower(trim($email))])->first();

        if ($user?->isAdmin() === true) {
            Log::warning('Login: cuenta de administración bloqueada por intentos fallidos.', [
                'user_id' => $user->id,
                'panel' => static::RATE_LIMIT_PREFIX,
            ]);
        }
    }
}
