<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Respuestas que no se guardan ni se indexan (ADR 0048): la página de
 * confirmación del dueño lleva un código en la dirección y la API del modo
 * Campo, datos de captura. Ninguna caché compartida ni el historial de un
 * buscador deben quedarse con ellas.
 */
class PrivateResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('X-Robots-Tag', SetSecurityHeaders::NOINDEX);

        return $response;
    }
}
