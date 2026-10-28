<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Con una contraseña temporal (users.must_change_password, #19, ADR 0027),
 * la persona entra al panel solo a su perfil para cambiarla: cualquier otra
 * página del panel la lleva ahí. Salir sigue funcionando.
 */
class RequirePasswordChange
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $panel = Filament::getCurrentPanel();

        if (! $user instanceof User || ! $user->must_change_password || $panel === null) {
            return $next($request);
        }

        $allowed = ["filament.{$panel->getId()}.auth.profile", "filament.{$panel->getId()}.auth.logout"];
        $profile = $panel->getProfileUrl();

        if ($profile === null || $request->routeIs(...$allowed)) {
            return $next($request);
        }

        return redirect()->to($profile);
    }
}
