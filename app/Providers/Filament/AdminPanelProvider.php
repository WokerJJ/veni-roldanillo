<?php

namespace App\Providers\Filament;

use App\Filament\Admin\Auth\Login;
use App\Filament\Owner\Support\InitialsAvatarProvider;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\UseContentSecurityPolicyProfile;
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
 * Panel de administración (#19, ADR 0027) en /admin.
 *
 * - Entra solo users.role = admin (User::canAccessPanel); un dueño, un
 *   empleado o cualquier otra cuenta recibe 403. Sin registro ni «olvidé mi
 *   contraseña»; el login es el del panel del dueño con su propia cuenta de
 *   intentos (Admin\Auth\Login).
 * - Autorización estricta, como el del dueño: cada recurso pregunta a una
 *   Policy (RestaurantPolicy y RestaurantRequestPolicy), que también exige
 *   el rol de administración.
 * - Sin tenancy: administración ve todas las fichas. Lo que cambia estados
 *   (publicar, ocultar, aprobar, rechazar) pasa por las acciones de
 *   App\Actions\Restaurants, cada una en su transacción.
 * - CSP: el mismo perfil «panel» que /panel (OwnerPanelProvider::cspProfile).
 */
class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->id('admin')
            ->path('admin')
            ->login(Login::class)
            ->profile(isSimple: false)
            ->brandName('Vení · Administración')
            ->favicon(asset('favicon.ico'))
            ->defaultAvatarProvider(InitialsAvatarProvider::class)
            ->colors([
                'primary' => Color::hex('#6A5578'),
                'danger' => Color::Rose,
            ])
            ->strictAuthorization()
            ->discoverResources(in: app_path('Filament/Admin/Resources'), for: 'App\Filament\Admin\Resources')
            ->pages([
                Dashboard::class,
            ])
            ->widgets([])
            ->middleware([
                UseContentSecurityPolicyProfile::class.':'.OwnerPanelProvider::CSP_PROFILE,
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
            ]);
    }
}
