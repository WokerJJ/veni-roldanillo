<?php

namespace App\Providers;

use App\Jobs\Search\MakeSearchable;
use App\Jobs\Search\RemoveFromSearch;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Observers\SearchIndexObserver;
use App\Support\ContentSecurityPolicyProfiles;
use App\Support\LegalReadiness;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Scout\Scout;
use Meilisearch\Client as MeilisearchClient;

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
     * Solicitudes de reclamo y de retiro de ficha (#20) por hora desde una
     * misma IP (también cuentan los envíos con errores). Una persona manda una
     * o dos; el margen es para corregir y para la NAT del
     * operador móvil.
     */
    public const RESTAURANT_REQUESTS_PER_HOUR_PER_IP = 20;

    /**
     * Las mismas, por día con un mismo celular, sumando todas las fichas:
     * frena a quien cambia de IP para insistir con el mismo número. Solo
     * cuentan los envíos válidos (RestaurantContactRequest::passedValidation),
     * así los errores de otro no bloquean al dueño real del número.
     */
    public const RESTAURANT_REQUESTS_PER_DAY_PER_PHONE = 5;

    /**
     * Búsquedas de platos por minuto desde una misma IP (GET
     * /api/dishes/search, #17). El buscador espera a que se deje de teclear y
     * el navegador guarda cada respuesta un minuto: una persona hace unas
     * pocas; el margen, como siempre, es para la NAT del operador móvil.
     */
    public const DISH_SEARCHES_PER_MINUTE = 60;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Perfiles de la CSP por ruta (ADR 0014): los registran los
        // proveedores al arrancar y los lee SetContentSecurityPolicy.
        $this->app->singleton(ContentSecurityPolicyProfiles::class);

        // El cliente de Meilisearch de Scout, con plazos: sin ellos, un
        // Meilisearch colgado deja colgada la petición (Guzzle espera para
        // siempre). Pasado el plazo, la búsqueda por plato responde 503
        // (ADR 0029). Este proveedor se registra después del de Scout.
        $this->app->singleton(MeilisearchClient::class, function (): MeilisearchClient {
            $host = config('scout.meilisearch.host');
            $key = config('scout.meilisearch.key');

            return new MeilisearchClient(
                is_string($host) ? $host : 'http://localhost:7700',
                is_string($key) ? $key : null,
                new GuzzleClient([
                    'timeout' => config()->float('scout.meilisearch.timeout', 2.0),
                    'connect_timeout' => config()->float('scout.meilisearch.connect_timeout', 1.0),
                ]),
            );
        });
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

        RateLimiter::for('dish-search', fn (Request $request) => Limit::perMinute(self::DISH_SEARCHES_PER_MINUTE)
            ->by((string) $request->ip()));

        // Los cambios de la ficha y de las secciones que mueven el índice de
        // búsqueda por plato (ADR 0029); los del plato los sigue Scout, con
        // esperas entre reintentos (App\Jobs\Search).
        Restaurant::observe(SearchIndexObserver::class);
        MenuSection::observe(SearchIndexObserver::class);
        Scout::makeSearchableUsing(MakeSearchable::class);
        Scout::removeFromSearchUsing(RemoveFromSearch::class);

        // Reclamos y retiros (#20): por IP aquí, con todos los envíos. El tope
        // por celular va en RestaurantContactRequest, después de validar. Pasado
        // el límite, 429 con el aviso en el idioma de la petición.
        RateLimiter::for('restaurant-requests', fn (Request $request) => Limit::perHour(self::RESTAURANT_REQUESTS_PER_HOUR_PER_IP)
            ->by('ip:'.$request->ip())
            ->response(fn (Request $request, array $headers) => response(
                __('requests.error.too_many'),
                429,
                [...$headers, 'Content-Type' => 'text/plain; charset=UTF-8'],
            )));

        // La política que solo informa no bloquea nada: en producción es para
        // probar un cambio un rato, nunca el estado normal (ADR 0014).
        if ($this->app->isProduction() && config('security.csp.report_only') === true) {
            Log::warning('CSP_REPORT_ONLY está activo en producción: la política de contenido no bloquea nada, solo informa en la consola del navegador.');
        }

        // La política de datos publicada con el correo de ejemplo, sin el
        // responsable o todavía como borrador (#23): avisa en el registro.
        LegalReadiness::report();
    }
}
