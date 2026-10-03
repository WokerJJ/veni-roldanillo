<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Cambios de idioma por minuto desde una misma IP (PUT /locale). Una
     * persona cambia de idioma un par de veces; el margen es para las muchas
     * que comparten IP detrás de la NAT de un operador móvil.
     */
    public const LOCALE_CHANGES_PER_MINUTE = 30;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Por la IP real del cliente: detrás del proxy que termina TLS la da
        // TrustProxies (ADR 0014); sin él, todos compartirían la del proxy.
        RateLimiter::for('locale', fn (Request $request) => Limit::perMinute(self::LOCALE_CHANGES_PER_MINUTE)
            ->by((string) $request->ip())
            ->response(fn (Request $request, array $headers) => response(
                __('locale.too_many_changes'),
                429,
                [...$headers, 'Content-Type' => 'text/plain; charset=UTF-8'],
            )));
    }
}
