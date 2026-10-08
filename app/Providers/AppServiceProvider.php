<?php

namespace App\Providers;

use App\Support\ContentSecurityPolicyProfiles;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
     * Veces por minuto que una misma IP puede pedir los restaurantes del mapa
     * (GET /api/restaurants.geojson). El navegador guarda la respuesta un
     * minuto, así que una persona la pide una vez por idioma; el margen, otra
     * vez, es para quienes comparten IP.
     */
    public const RESTAURANT_MAP_REQUESTS_PER_MINUTE = 60;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Perfiles de la CSP por ruta (ADR 0014): los registran los
        // proveedores al arrancar y los lee SetContentSecurityPolicy.
        $this->app->singleton(ContentSecurityPolicyProfiles::class);
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

        // Pasado el límite, el 429 de siempre, que bajo /api sale como JSON.
        RateLimiter::for('restaurant-map', fn (Request $request) => Limit::perMinute(self::RESTAURANT_MAP_REQUESTS_PER_MINUTE)
            ->by((string) $request->ip()));

        // La política que solo informa no bloquea nada: en producción es para
        // probar un cambio un rato, nunca el estado normal (ADR 0014).
        if ($this->app->isProduction() && config('security.csp.report_only') === true) {
            Log::warning('CSP_REPORT_ONLY está activo en producción: la política de contenido no bloquea nada, solo informa en la consola del navegador.');
        }
    }
}
