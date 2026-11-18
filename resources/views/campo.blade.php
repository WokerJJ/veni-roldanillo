{{--
    El shell del modo Campo (ADR 0048): HTML estático, sin sesión ni datos de
    nadie, sin script ni estilo en línea (como la página sin conexión). El
    service worker lo guarda para que abra sin señal; lo que trabaja con datos
    es la API de /campo/api, que exige la sesión de administración.
--}}
@php($build = fn (string $entry): string => (string) parse_url(Vite::asset($entry), PHP_URL_PATH))
<!DOCTYPE html>
<html lang="{{ \App\Enums\Locale::DEFAULT->value }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="robots" content="noindex, nofollow">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('light') }}" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('dark') }}" media="(prefers-color-scheme: dark)">
        <title>Campo · {{ \App\Support\WebApp::NAME }}</title>
        <link rel="stylesheet" href="{{ $build('resources/campo/campo.css') }}">
        {{-- Los textos en los dos idiomas: un bloque de datos, sin código que ejecutar (la CSP no lo toca). --}}
        <script type="application/json" id="campo-texts">{!! json_encode(['es' => \Illuminate\Support\Facades\Lang::get('campo', [], 'es'), 'en' => \Illuminate\Support\Facades\Lang::get('campo', [], 'en')], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) !!}</script>
        <script type="module" src="{{ $build('resources/campo/main.ts') }}"></script>
    </head>
    <body>
        <div id="campo"></div>
    </body>
</html>
