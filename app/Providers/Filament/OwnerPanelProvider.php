<?php

namespace App\Providers\Filament;

use App\Filament\Auth\EditProfile;
use App\Filament\Owner\Auth\Login;
use App\Filament\Owner\Pages\EditRestaurantProfile;
use App\Filament\Owner\Support\InitialsAvatarProvider;
use App\Http\Middleware\RequirePasswordChange;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\UseContentSecurityPolicyProfile;
use App\Models\Restaurant;
use App\Support\ContentSecurityPolicy;
use App\Support\ContentSecurityPolicyProfiles;
use Filament\Http\Middleware\Authenticate;
use Filament\Http\Middleware\AuthenticateSession;
use Filament\Http\Middleware\DisableBladeIconComponents;
use Filament\Http\Middleware\DispatchServingFilamentEvent;
use Filament\Pages\Dashboard;
use Filament\Panel;
use Filament\PanelProvider;
use Filament\Support\Colors\Color;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

/**
 * Panel del dueño (#18, ADR 0025) en /panel.
 *
 * - Entra solo quien ya tiene cuenta: sin registro, sin «olvidé mi
 *   contraseña» (no hay correo saliente), con el límite de intentos de
 *   Filament por IP (5 por minuto) y otro por cuenta (Auth\Login). Las
 *   cuentas las crea administración o el reclamo de una ficha (#20).
 * - Autorización estricta: si a una Policy le falta un método que Filament
 *   pregunta, el panel falla en vez de permitir.
 * - Tenancy por restaurante: la dirección lleva el slug
 *   (/panel/{slug}/dishes) y Filament comprueba en cada petición que la
 *   persona sea dueña de ese restaurante (User::canAccessTenant). Las tablas
 *   se filtran por el restaurante de la dirección y lo que se crea queda
 *   colgado de él por la relación, nunca por un restaurant_id del cliente.
 *   Las Policies (RestaurantPolicy y RestaurantContentPolicy) autorizan
 *   además cada registro.
 * - CSP: el perfil «panel» (ADR 0014 y 0025) parte de la política pública y
 *   le suma solo lo que Filament necesita, y solo en estas rutas
 *   (cspProfile()).
 */
class OwnerPanelProvider extends PanelProvider
{
    /** Perfil de la CSP de las rutas del panel. */
    public const CSP_PROFILE = 'panel';

    public function register(): void
    {
        parent::register();

        $this->app->afterResolving(ContentSecurityPolicyProfiles::class, function (ContentSecurityPolicyProfiles $profiles): void {
            $profiles->register(self::CSP_PROFILE, self::cspProfile(...));
        });
    }

    /**
     * Lo que el panel suma a la política pública, y solo en sus rutas:
     *
     * - script-src 'unsafe-eval': Alpine (dentro de Livewire) evalúa las
     *   expresiones de los atributos x-data, x-on… con new Function. Su
     *   versión sin eval (csp_safe) no entiende las de Filament. Los scripts
     *   siguen necesitando el nonce: lo que se permite es evaluar texto desde
     *   un script que ya es de confianza.
     * - style-src-attr 'unsafe-inline': los atributos style="…" que Filament
     *   escribe en su HTML (colores, anchos). Los nonces no cubren atributos;
     *   los <style> siguen necesitando el nonce (las vistas de
     *   resources/views/vendor lo agregan donde Filament no lo pone).
     *
     * El riesgo que queda: con eval, un atributo x-data o x-on que se colara
     * en el HTML se ejecutaría. Todo lo que escribe el panel pasa por el
     * escape de Blade y de Filament; ADR 0025.
     */
    public static function cspProfile(ContentSecurityPolicy $policy): ContentSecurityPolicy
    {
        return $policy
            ->with('script-src', "'unsafe-eval'")
            ->with('style-src-attr', "'unsafe-inline'");
    }

    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('owner')
            ->path('panel')
            ->login(Login::class)
            ->profile(EditProfile::class)
            ->databaseTransactions()
            ->brandName('Vení · Panel')
            ->favicon(asset('favicon.ico'))
            ->defaultAvatarProvider(InitialsAvatarProvider::class)
            ->colors([
                'primary' => Color::hex('#6A5578'),
                'danger' => Color::Rose,
            ])
            ->tenant(Restaurant::class, slugAttribute: 'slug', ownershipRelationship: 'restaurant')
            ->tenantProfile(EditRestaurantProfile::class)
            ->strictAuthorization()
            ->discoverResources(in: app_path('Filament/Owner/Resources'), for: 'App\Filament\Owner\Resources')
            ->discoverPages(in: app_path('Filament/Owner/Pages'), for: 'App\Filament\Owner\Pages')
            ->pages([
                Dashboard::class,
            ])
            ->widgets([])
            ->middleware([
                UseContentSecurityPolicyProfile::class.':'.self::CSP_PROFILE,
                EncryptCookies::class,
                AddQueuedCookiesToResponse::class,
                StartSession::class,
                AuthenticateSession::class,
                ShareErrorsFromSession::class,
                PreventRequestForgery::class,
                SubstituteBindings::class,
                SetLocale::class,
                DisableBladeIconComponents::class,
                DispatchServingFilamentEvent::class,
            ])
            ->authMiddleware([
                Authenticate::class,
                RequirePasswordChange::class,
            ]);
    }
}
