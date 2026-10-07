{{--
    Página sin conexión (#5). El service worker la guarda al instalarse y la
    muestra cuando una navegación falla sin red o tarda más de 10 segundos
    (resources/js/pwa/runtimeCaching.ts); online casi nunca se ve. Trae los textos en los dos idiomas porque, sin red, no hay a
    quién preguntarle el idioma: resources/js/offline.ts elige uno antes de
    pintar, con el último que respondió la app en el dispositivo, y pone el
    tema. Sin nada en línea: el script y el estilo salen del build, también
    guardados, y la CSP de la respuesta guardada no necesita su nonce. Las
    rutas de los archivos van sin esquema ni host: la página guardada sirve
    igual aunque el proxy de delante cambie (ADR 0014).
--}}
@php($build = fn (string $entry): string => (string) parse_url(Vite::asset($entry), PHP_URL_PATH))
<!DOCTYPE html>
<html lang="{{ \App\Enums\Locale::DEFAULT->value }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('light') }}" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="{{ \App\Support\WebApp::themeColor('dark') }}" media="(prefers-color-scheme: dark)">

        <title>{{ __('offline.title', [], \App\Enums\Locale::DEFAULT->value) }} · {{ \App\Support\WebApp::NAME }}</title>

        <script src="{{ $build('resources/js/offline.ts') }}"></script>
        <link rel="stylesheet" href="{{ $build('resources/css/offline.css') }}">
    </head>
    <body>
        <main>
            <img class="logo logo-light" src="{{ $build('brand/logo/veni-wordmark.svg') }}" alt="{{ \App\Support\WebApp::SHORT_NAME }}" width="72" height="40">
            <img class="logo logo-dark" src="{{ $build('brand/logo/veni-wordmark-blanco.svg') }}" alt="{{ \App\Support\WebApp::SHORT_NAME }}" width="72" height="40">

            @foreach (\App\Enums\Locale::cases() as $locale)
                <section lang="{{ $locale->value }}" data-locale="{{ $locale->value }}" data-title="{{ __('offline.title', [], $locale->value) }} · {{ \App\Support\WebApp::NAME }}">
                    <h1>{{ __('offline.title', [], $locale->value) }}</h1>
                    <p>{{ __('offline.message', [], $locale->value) }}</p>
                    <button type="button" data-retry>{{ __('offline.retry', [], $locale->value) }}</button>
                </section>
            @endforeach
        </main>
    </body>
</html>
