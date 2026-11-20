<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * /robots.txt. Sin ROBOTS_NOINDEX deja entrar a todo, como siempre; con ella
 * (un dominio de pruebas o de demostración) pide que ningún buscador indexe
 * nada. Es una ruta y no un archivo de public/ porque un archivo estático lo
 * sirve FrankenPHP sin pasar por Laravel y no podría cambiar con el entorno.
 * Las cabeceras X-Robots-Tag de las respuestas las pone SetSecurityHeaders.
 */
class RobotsController extends Controller
{
    public function __invoke(): Response
    {
        $rule = config()->boolean('app.robots_noindex') ? 'Disallow: /' : 'Disallow:';

        return response("User-agent: *\n{$rule}\n", 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }
}
