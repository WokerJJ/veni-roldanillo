<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad de todas las respuestas de Laravel, también las de
 * error (ADR 0014). Va primero en el middleware global: envuelve a todos los
 * demás, incluido el modo de mantenimiento. La política de contenido (CSP)
 * va aparte, en SetContentSecurityPolicy.
 *
 * Los archivos que FrankenPHP sirve sin pasar por Laravel (public/build,
 * public/fonts, public/storage) no llevan estas cabeceras: su caché y
 * `nosniff` los pone Caddy (config/octane.php).
 */
class SetSecurityHeaders
{
    /**
     * Un año, también para los subdominios (el mapa irá en
     * tiles.veniroldanillo.co, ADR 0007). Sin `preload`: entrar en la lista de
     * los navegadores es casi irreversible y se decide aparte.
     */
    public const HSTS = 'max-age=31536000; includeSubDomains';

    /**
     * Funciones del navegador que la app no usa, apagadas para la página y
     * para cualquier iframe que cargue. La ubicación queda solo para este
     * origen: «¿Dónde estoy?» la pide en el dispositivo (ADR 0008).
     * Solo funciones que Chrome reconoce: una desconocida deja un error en
     * la consola de cada página.
     *
     * @var array<string, string>
     */
    public const PERMISSIONS = [
        'accelerometer' => '()',
        'browsing-topics' => '()',
        'camera' => '()',
        'display-capture' => '()',
        'geolocation' => '(self)',
        'gyroscope' => '()',
        'hid' => '()',
        'magnetometer' => '()',
        'microphone' => '()',
        'midi' => '()',
        'payment' => '()',
        'serial' => '()',
        'usb' => '()',
        'xr-spatial-tracking' => '()',
    ];

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $headers = $response->headers;

        // El navegador respeta el tipo declarado: un archivo no se ejecuta
        // como script ni como hoja de estilos por lo que parezca su contenido.
        $headers->set('X-Content-Type-Options', 'nosniff');
        // A otros sitios (wa.me, Google Maps) solo les llega el origen, sin la
        // ruta ni los parámetros de la página.
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $headers->set('Permissions-Policy', self::permissionsPolicy());
        // Ninguna página se muestra dentro de un iframe (clickjacking). La CSP
        // lo repite con frame-ancestors; esta cubre a los navegadores viejos.
        $headers->set('X-Frame-Options', 'DENY');

        // isSecure() ya sabe del proxy de confianza: TrustProxies corrió
        // dentro de $next. Por HTTP el navegador ignoraría HSTS; en
        // desarrollo obligaría a usar HTTPS en localhost durante un año.
        if (app()->isProduction() && $request->isSecure()) {
            $headers->set('Strict-Transport-Security', self::HSTS);
        }

        return $response;
    }

    public static function permissionsPolicy(): string
    {
        $directives = [];

        foreach (self::PERMISSIONS as $feature => $allowlist) {
            $directives[] = "{$feature}={$allowlist}";
        }

        return implode(', ', $directives);
    }
}
