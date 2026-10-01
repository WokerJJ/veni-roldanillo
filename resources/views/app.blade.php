<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="description" content="{{ __('meta.description') }}">

        {{--
            Tema antes de pintar para evitar el destello: la preferencia guardada
            en el dispositivo o, si no hay, la del sistema. Misma clave que
            resources/js/composables/useTheme.ts.
        --}}
        <script>
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

        @vite(['resources/js/app.ts', "resources/js/pages/{$page['component']}.vue"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Vení Roldanillo') }}</title>
        </x-inertia::head>
    </head>
    <body>
        <x-inertia::app />
    </body>
</html>
