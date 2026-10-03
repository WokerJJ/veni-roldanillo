{{--
    Base de las páginas de error de Laravel (404, 419, 429, 500, 503…): reemplaza
    a la del framework, que trae sus estilos en un <style> sin nonce y la CSP los
    bloquearía (ADR 0014). Sin @vite: un error no depende de los assets
    compilados. Colores de la marca (brand/tokens.css), claro y oscuro.
--}}
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title>@yield('title')</title>

        <style nonce="{{ Vite::cspNonce() }}">
            :root {
                color-scheme: light dark;
                --canvas: #ffffff;
                --ink: #2a1638;
                --line: #d4cbd9;
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --canvas: #2a1638;
                    --ink: #ffffff;
                    --line: #6a5578;
                }
            }

            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: var(--canvas);
                color: var(--ink);
                font: 1.125rem/1.5 system-ui, sans-serif;
            }

            main {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 1rem;
            }

            h1 {
                margin: 0;
                padding-right: 1rem;
                border-right: 1px solid var(--line);
                font-size: inherit;
            }
        </style>
    </head>
    <body>
        <main>
            <h1>@yield('code')</h1>
            <p>@yield('message')</p>
        </main>
    </body>
</html>
