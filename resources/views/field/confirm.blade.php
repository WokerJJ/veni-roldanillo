{{--
    La página con que el dueño confirma su ficha (ADR 0048). HTML del
    servidor, con un formulario común: nada de JavaScript. Mostrarla no
    consume el enlace; solo el botón «Confirmo». El texto de la autorización
    es provisional hasta la revisión jurídica (lang/{idioma}/field.php).
--}}
@php($build = fn (string $entry): string => (string) parse_url(Vite::asset($entry), PHP_URL_PATH))
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta name="referrer" content="no-referrer">
        <title>{{ __('field.confirm.title') }} · {{ \App\Support\WebApp::NAME }}</title>
        <link rel="stylesheet" href="{{ $build('resources/css/confirm.css') }}">
    </head>
    <body>
        <main>
            <img class="logo" src="{{ $build('brand/logo/veni-wordmark.svg') }}" alt="{{ \App\Support\WebApp::SHORT_NAME }}" width="72" height="40">

            <p class="draft" role="note">{{ __('field.confirm.draft') }}</p>

            <h1>{{ __('field.confirm.title') }}</h1>
            <p>{{ __('field.confirm.intro') }}</p>

            <section class="card" aria-labelledby="ficha">
                <h2 id="ficha">{{ $name }}</h2>
                <dl>
                    <dt>{{ __('field.confirm.categories') }}</dt>
                    <dd>{{ $categories }}</dd>

                    <dt>{{ __('field.confirm.address') }}</dt>
                    <dd>{{ $address }}@if ($reference) · {{ $reference }}@endif</dd>

                    @if ($phone)
                        <dt>{{ __('field.confirm.phone') }}</dt>
                        <dd>{{ $phone }}</dd>
                    @endif

                    @if ($whatsapp)
                        <dt>{{ __('field.confirm.whatsapp') }}</dt>
                        <dd>+{{ $whatsapp }}</dd>
                    @endif

                    <dt>{{ __('field.confirm.delivery') }}</dt>
                    <dd>{{ $delivery ? __('field.confirm.yes') : __('field.confirm.no') }}</dd>

                    @if ($payments !== [])
                        <dt>{{ __('field.confirm.payments') }}</dt>
                        <dd>{{ implode(', ', $payments) }}</dd>
                    @endif

                    <dt>{{ __('field.confirm.hours') }}</dt>
                    <dd>
                        @if ($hours === [])
                            {{ __('field.confirm.no_hours') }}
                        @else
                            <ul>
                                @foreach ($hours as $line)
                                    <li>{{ ltrim($line, '• ') }}</li>
                                @endforeach
                            </ul>
                        @endif
                    </dd>
                </dl>
            </section>

            <p class="muted">{{ __('field.confirm.owner', ['name' => $ownerName, 'role' => __('field.confirm.role_'.$ownerRole)]) }}</p>

            <form method="post" action="{{ route('field.confirm.store', ['code' => $code]) }}">
                @csrf
                <input type="hidden" name="seen_hash" value="{{ $seenHash }}">

                @error('seen_hash')
                    <p class="error" role="alert">{{ $message }}</p>
                @enderror

                <h2>{{ __('field.confirm.authorization_title') }}</h2>
                <p>{{ __('field.confirm.authorization') }}</p>
                <p class="muted">{{ __('field.confirm.privacy') }}
                    <a href="{{ route('legal.privacy') }}" target="_blank" rel="noopener noreferrer">{{ __('field.confirm.privacy_link') }}</a>
                    ({{ $privacyVersion }})</p>

                <button type="submit">{{ __('field.confirm.button') }}</button>
            </form>

            <p class="muted footnote">{{ __('field.confirm.not_ok') }}</p>
        </main>
    </body>
</html>
