<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

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
