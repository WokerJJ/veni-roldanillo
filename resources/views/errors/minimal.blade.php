{{--
    Base de las páginas de error de Laravel (404, 419, 429, 500, 503 en esta
    carpeta, con sus textos en lang/{idioma}.json; las demás, las del framework):
    reemplaza a la del framework, que trae sus estilos en un <style> sin nonce y
    la CSP los bloquearía (ADR 0014). Sin @vite: un error no depende de los
    assets compilados. Los colores salen de los tokens de la marca
    (brand/tokens.css, que la imagen de producción trae), claro y oscuro. El
    idioma lo resuelve SetLocale::forErrorPage() aunque SetLocale no haya corrido.
    El enlace al inicio es relativo: con un Host que no es de confianza, generar
    una URL completa volvería a fallar.
--}}
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title>@yield('title')</title>

        <style nonce="{{ Vite::cspNonce() }}">
            {!! File::get(base_path('brand/tokens.css')) !!}

            :root {
                color-scheme: light dark;
                --canvas: var(--veni-blanco);
                --ink: var(--veni-ciruela);
                --line: color-mix(in oklab, var(--veni-ciruela) 15%, transparent);
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --canvas: var(--veni-ciruela);
                    --ink: var(--veni-blanco);
                    --line: color-mix(in oklab, var(--veni-lila) 20%, transparent);
                }
            }

            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: var(--canvas);
                color: var(--ink);
                font: 1.125rem/1.5 var(--veni-font-body);
            }

            main {
                max-width: 32rem;
                padding: 1.5rem;
            }

            p {
                margin: 0 0 1rem;
            }

            .code {
                padding-bottom: 0.5rem;
                border-bottom: 1px solid var(--line);
                font-weight: 700;
            }

            h1 {
                margin: 0 0 0.5rem;
                font: 700 1.5rem/1.25 var(--veni-font-display);
            }

            a {
                display: inline-flex;
                align-items: center;
                min-height: var(--veni-touch-min);
                color: inherit;
                font-weight: 700;
            }
        </style>
    </head>
    <body>
        <main>
            <p class="code">@yield('code')</p>
            <h1>@yield('title')</h1>
            <p>@yield('message')</p>
            <a href="/">{{ __('errors.home') }}</a>
        </main>
    </body>
</html>
