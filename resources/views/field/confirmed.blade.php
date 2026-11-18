{{-- Lo que ve el dueño después de confirmar (ADR 0048). --}}
@php($build = fn (string $entry): string => (string) parse_url(Vite::asset($entry), PHP_URL_PATH))
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <title>{{ __('field.confirm.done_title') }} · {{ \App\Support\WebApp::NAME }}</title>
        <link rel="stylesheet" href="{{ $build('resources/css/confirm.css') }}">
    </head>
    <body>
        <main>
            <img class="logo" src="{{ $build('brand/logo/veni-wordmark.svg') }}" alt="{{ \App\Support\WebApp::SHORT_NAME }}" width="72" height="40">
            <h1>{{ __('field.confirm.done_title') }}</h1>
            <p role="status">{{ __('field.confirm.done') }}</p>
        </main>
    </body>
</html>
