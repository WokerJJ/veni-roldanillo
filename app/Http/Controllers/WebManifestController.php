<?php

namespace App\Http\Controllers;

use App\Support\WebApp;
use Illuminate\Http\JsonResponse;

/**
 * Manifest web de la PWA (#5): lo que el navegador necesita para instalar la
 * app (nombre, íconos, colores, pantalla completa). Va sin el grupo `web`
 * (routes/web.php): el navegador lo pide sin cookies y no abre sesión.
 */
class WebManifestController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(WebApp::manifest(), headers: [
            'Content-Type' => 'application/manifest+json',
            // Cambia solo con un despliegue; el navegador lo vuelve a pedir
            // al día siguiente para actualizar la app instalada.
            'Cache-Control' => 'public, max-age=86400',
        ], options: JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
