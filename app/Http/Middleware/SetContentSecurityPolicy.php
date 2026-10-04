<?php

namespace App\Http\Middleware;

use App\Support\ContentSecurityPolicy;
use App\Support\ContentSecurityPolicyProfiles;
use App\Support\FrameAncestors;
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
 *
 * La política es la del perfil de la ruta (App\Support\ContentSecurityPolicyProfiles),
 * la pública si no declara otro. Con CSP_REPORT_CANDIDATE se manda además la
 * candidata en Content-Security-Policy-Report-Only: el navegador aplica la
 * vigente y solo informa de lo que la candidata bloquearía.
 */
class SetContentSecurityPolicy
{
    public function __construct(private readonly ContentSecurityPolicyProfiles $profiles) {}

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

        // La ruta ya está resuelta: este middleware envuelve al router.
        $profile = $request->route()?->getAction('csp');
        $profile = is_string($profile) ? $profile : ContentSecurityPolicy::PUBLIC_PROFILE;
        $reportOnly = config('security.csp.report_only') === true;

        $policy = $this->profiles->apply($profile, $this->publicPolicy($nonce, $reportOnly));
        $response->headers->set($policy->headerName(), $policy->headerValue());

        // Si la vigente ya solo informa, la candidata no agrega nada.
        if (! $reportOnly
            && config('security.csp.report_candidate') === true
            && $this->profiles->has(ContentSecurityPolicy::CANDIDATE_PROFILE)) {
            $candidate = $this->profiles->apply(
                ContentSecurityPolicy::CANDIDATE_PROFILE,
                $this->profiles->apply($profile, $this->publicPolicy($nonce, reportOnly: true)),
            );
            $response->headers->set($candidate->headerName(), $candidate->headerValue());
        }

        return $response;
    }

    private function publicPolicy(string $nonce, bool $reportOnly): ContentSecurityPolicy
    {
        return new ContentSecurityPolicy(
            nonce: $nonce,
            mapOrigins: MapOrigin::configured(),
            devServer: $this->devServer(),
            reportOnly: $reportOnly,
            frameAncestors: FrameAncestors::configured(),
        );
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
