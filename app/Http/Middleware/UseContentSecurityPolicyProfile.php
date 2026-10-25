<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Declara el perfil de la CSP de una ruta desde su lista de middleware:
 * `UseContentSecurityPolicyProfile::class.':panel'`. Sirve para las rutas
 * que registra un paquete (Filament), donde no se puede escribir
 * `['csp' => …]` en la acción. SetContentSecurityPolicy, que envuelve a todo,
 * lee el perfil al volver.
 */
class UseContentSecurityPolicyProfile
{
    /** Atributo de la petición donde queda el perfil. */
    public const ATTRIBUTE = 'csp_profile';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $profile): Response
    {
        $request->attributes->set(self::ATTRIBUTE, $profile);

        return $next($request);
    }
}
