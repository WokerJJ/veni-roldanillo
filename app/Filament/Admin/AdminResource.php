<?php

namespace App\Filament\Admin;

use App\Actions\Restaurants\ActionRefused;
use App\Models\User;
use Closure;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Auth;

/**
 * Base de los recursos del panel de administración (#19, ADR 0027). Además
 * de que el panel solo deja entrar a administración (User::canAccessPanel) y
 * de las Policies, cada recurso exige el rol: si una Policy algún día
 * permitiera de más (RestaurantPolicy::viewAny deja ver la lista pública a
 * cualquiera), el recurso sigue cerrado.
 */
abstract class AdminResource extends Resource
{
    public static function admin(): ?User
    {
        $user = Auth::user();

        return $user instanceof User && $user->isAdmin() ? $user : null;
    }

    public static function canAccess(): bool
    {
        return static::admin() !== null && parent::canAccess();
    }

    public static function canViewAny(): bool
    {
        return static::admin() !== null && parent::canViewAny();
    }

    public static function canDeleteAny(): bool
    {
        return false;
    }

    /**
     * Corre una acción de dominio como la persona de administración y, si el
     * estado ya no la permite (otra persona la resolvió, la ficha cambió),
     * avisa en vez de fallar.
     *
     * @param  Closure(User): mixed  $action
     */
    public static function runAction(Closure $action, string $success): void
    {
        $admin = static::admin() ?? throw new AuthorizationException;

        try {
            $action($admin);
        } catch (ActionRefused $refused) {
            Notification::make()->danger()->title(__("panel.admin.refused.{$refused->reason}"))->send();

            return;
        }

        Notification::make()->success()->title($success)->send();
    }
}
