<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="description" content="{{ __('meta.description') }}">

        {{--
            App instalable (#5): el manifest y el color de la barra del sistema,
            el del fondo de la cabecera en claro y en oscuro. Si se elige otro
            tema en la app, useTheme ajusta los dos. iOS no lee los íconos del
            manifest: el suyo va aparte. Enlaces relativos, como los de las
            páginas de error.
        --}}
        <link rel="manifest" href="/manifest.webmanifest">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('light') }}" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('dark') }}" media="(prefers-color-scheme: dark)">
        <link rel="apple-touch-icon" href="{{ \App\Support\WebApp::iconUrl(\App\Support\WebApp::APPLE_TOUCH_ICON) }}">

        {{--
            Nonce de la política de seguridad de contenido de esta respuesta
            (SetContentSecurityPolicy). De aquí lo leen Vite, para los CSS y
            módulos que carga después, e Inertia (resources/js/csp.ts). Va en
            el atributo nonce, que el navegador oculta a los selectores de CSS.
        --}}
        <meta property="csp-nonce" nonce="{{ Vite::cspNonce() }}">

        {{--
            Tema antes de pintar para evitar el destello: la preferencia guardada
            en el dispositivo o, si no hay, la del sistema. Misma clave que
            resources/js/composables/useTheme.ts. Es el único script en línea:
            lleva el nonce para que la CSP lo deje correr.
        --}}
        <script nonce="{{ Vite::cspNonce() }}">
            (function () {
                var theme = null;
                try {
                    theme = localStorage.getItem('veni:theme');
                } catch (error) {}
                if (theme !== 'light' && theme !== 'dark') {
                    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                document.documentElement.dataset.theme = theme;
            })();
        </script>

        {{-- Fuentes autohospedadas: se precargan para evitar el salto de texto. --}}
        <link rel="preload" href="/fonts/figtree-latin-400-700.woff2" as="font" type="font/woff2" crossorigin>
        <link rel="preload" href="/fonts/bricolage-grotesque-latin-700-800.woff2" as="font" type="font/woff2" crossorigin>

        {{--
            El mapa (estilo, tiles, fuentes y sprites) se pide con fetch a otro
            host: la conexión se abre ya, mientras baja el JavaScript.
        --}}
        @php($mapOrigin = \App\Support\MapOrigin::fromStyleUrl(config('services.map.style_url')))
        @if ($mapOrigin !== null)
            <link rel="preconnect" href="{{ $mapOrigin }}" crossorigin>
        @endif

        @vite(['resources/js/app.ts', "resources/js/pages/{$page['component']}.vue"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Vení Roldanillo') }}</title>
        </x-inertia::head>
    </head>
    <body>
        <x-inertia::app />
    </body>
</html>
