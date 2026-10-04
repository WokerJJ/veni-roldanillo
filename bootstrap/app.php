<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetContentSecurityPolicy;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\SetSecurityHeaders;
use App\Support\TrustedHosts;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Detrás del proxy que termina TLS (ADR 0014): IP del cliente y esquema,
        // solo de los proxies de config/trustedproxy.php. El host y el puerto
        // salen de Host, que el proxy pasa tal cual: sin X-Forwarded-Host ni
        // -Port, -Prefix o las de AWS, que ningún proxy de los previstos
        // necesita. Si alguno dejara pasar las que trae el cliente, cambiarían
        // el host o la raíz de todas las URL que genera la aplicación.
        $middleware->trustProxies(
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO,
        );

        // Y Host solo puede ser el de APP_URL (o el del propio equipo, para la
        // revisión de salud): con otro, 400 (App\Support\TrustedHosts).
        $middleware->trustHosts(
            at: fn (): array => TrustedHosts::patterns(config('app.url')),
            subdomains: false,
        );

        // Las cabeceras de seguridad y la CSP envuelven a todo el resto, para
        // que también las lleven los errores y el modo de mantenimiento.
        $middleware->prepend([
            SetSecurityHeaders::class,
            SetContentSecurityPolicy::class,
        ]);

        // SetLocale antes que Inertia: las props compartidas usan el idioma.
        $middleware->web(append: [
            SetLocale::class,
            HandleInertiaRequests::class,
        ]);

        // Laravel adelanta el límite de peticiones (throttle) por prioridad, a
        // antes del resto del grupo web; SetLocale va justo antes que él para
        // que el aviso del 429 salga en el idioma de la petición. Sigue después
        // de la sesión y la autenticación, de las que depende.
        $middleware->prependToPriorityList(before: ThrottleRequests::class, prepend: SetLocale::class);

        // El idioma no es secreto y se valida al leerlo (ADR 0010).
        $middleware->encryptCookies(except: [SetLocale::COOKIE]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Las páginas de error salen en el idioma de la petición también
        // cuando SetLocale no corrió (una ruta que no existe). No responde:
        // sigue la página de siempre, resources/views/errors.
        $exceptions->render(function (Throwable $e, Request $request) {
            SetLocale::forErrorPage($request);

            return null;
        });

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
