<?php

namespace App\Filament\Owner\Auth;

use DanHarrin\LivewireRateLimiting\Exceptions\TooManyRequestsException;
use Filament\Auth\Http\Responses\Contracts\LoginResponse;
use Filament\Auth\Pages\Login as FilamentLogin;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Login del panel del dueño (ADR 0025): el de Filament, que limita a cinco
 * intentos por minuto por IP, más un límite por cuenta: quien prueba claves
 * contra un mismo correo desde muchas IP también se detiene.
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
        $key = $this->accountRateLimitKey();

        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS_PER_ACCOUNT)) {
            $this->getRateLimitedNotification(new TooManyRequestsException(
                static::class, 'authenticate', request()->ip(), RateLimiter::availableIn($key),
            ))?->send();

            return null;
        }

        try {
            $response = parent::authenticate();
        } catch (ValidationException $exception) {
            RateLimiter::hit($key, self::ACCOUNT_DECAY_SECONDS);

            throw $exception;
        }

        if ($response !== null) {
            RateLimiter::clear($key);
        }

        return $response;
    }

    private function accountRateLimitKey(): string
    {
        $email = $this->data['email'] ?? '';

        return static::RATE_LIMIT_PREFIX.':'.hash('sha256', mb_strtolower(trim(is_string($email) ? $email : '')));
    }
}
