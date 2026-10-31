<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Para un POST público y sin sesión (no hay token CSRF que verificar), como
 * el registro del pedido por WhatsApp (#22, ADR 0031): solo lo acepta si
 * viene de la propia app.
 *
 * - 403 si el navegador dice que viene de otro lado: Sec-Fetch-Site presente
 *   y distinto de same-origin (cross-site, same-site o none), o un Origin
 *   distinto del de APP_URL (incluido «null»). Sin esas cabeceras (un
 *   navegador viejo, curl) se sigue: el límite por IP es la otra defensa.
 * - 415 si el tipo base no es JSON. Se compara el tipo sin parámetros
 *   (application/json, con o sin charset), no si el texto contiene «/json»:
 *   «text/plain; a=/json» es un tipo simple que un formulario o un fetch de
 *   otro sitio pueden mandar sin CORS.
 */
class RequireSameOriginJson
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $site = $request->headers->get('Sec-Fetch-Site');

        if ($site !== null && $site !== 'same-origin') {
            abort(403);
        }

        $origin = $request->headers->get('Origin');

        if ($origin !== null && $origin !== self::appOrigin()) {
            abort(403);
        }

        if ($request->getContentTypeFormat() !== 'json') {
            abort(415);
        }

        return $next($request);
    }

    /** scheme://host[:puerto] de APP_URL, como lo escribe el navegador en Origin. */
    public static function appOrigin(): string
    {
        $url = parse_url(config()->string('app.url'));
        $scheme = strtolower(is_array($url) && isset($url['scheme']) ? $url['scheme'] : 'http');
        $host = strtolower(is_array($url) && isset($url['host']) ? $url['host'] : '');
        $port = is_array($url) && isset($url['port']) ? $url['port'] : null;
        $defaultPort = $scheme === 'https' ? 443 : 80;

        return $scheme.'://'.$host.($port !== null && $port !== $defaultPort ? ':'.$port : '');
    }
}
