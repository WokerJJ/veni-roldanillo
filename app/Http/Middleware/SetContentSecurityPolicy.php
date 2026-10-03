<?php

namespace App\Http\Middleware;

use App\Support\ContentSecurityPolicy;
use App\Support\MapOrigin;
use App\Support\Origin;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\Response as IlluminateResponse;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Política de seguridad de contenido de cada respuesta (ADR 0014,
 * App\Support\ContentSecurityPolicy), con un nonce nuevo por petición.
 *
 * El nonce lo guarda el servicio Vite de Laravel: @vite lo pone en sus
 * etiquetas y la vista raíz en el script del tema y en
 * `<meta property="csp-nonce">`, de donde lo leen Vite (los CSS y módulos que
 * carga después) e Inertia (su barra de progreso). Con Octane el servicio
 * sobrevive entre peticiones del mismo worker; por eso el nonce se crea aquí
 * en cada una y no al arrancar.
 */
class SetContentSecurityPolicy
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Vite::useCspNonce();

        $response = $next($request);

        if ($this->isDebugErrorPage($response)) {
            return $response;
        }

        $policy = new ContentSecurityPolicy(
            nonce: $nonce,
            mapOrigins: MapOrigin::configured(),
            devServer: $this->devServer(),
            reportOnly: (bool) config('security.csp.report_only'),
        );

        $response->headers->set($policy->headerName(), $policy->headerValue());

        return $response;
    }

    /**
     * La página de error de desarrollo (APP_DEBUG) trae sus propios scripts y
     * estilos en línea, sin nonce: con la política activa se vería rota. Los
     * errores HTTP (404, 419, 429, 503) usan las vistas de errors/, que sí
     * llevan el nonce, y conservan la política.
     */
    private function isDebugErrorPage(Response $response): bool
    {
        return config('app.debug') === true
            && $response instanceof IlluminateResponse
            && $response->exception !== null
            && ! $response->exception instanceof HttpExceptionInterface;
    }

    /**
     * Origen del servidor de Vite mientras corre `npm run dev`: el plugin de
     * Laravel lo escribe en public/hot. Nunca en producción, aunque el archivo
     * apareciera.
     */
    private function devServer(): ?string
    {
        if (app()->isProduction() || ! Vite::isRunningHot()) {
            return null;
        }

        return Origin::fromUrl(File::get(Vite::hotFile()));
    }
}
