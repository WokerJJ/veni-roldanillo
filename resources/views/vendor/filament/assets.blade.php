@php
    use Illuminate\Support\Facades\Vite;
@endphp

@if (isset($data))
    @php
        $nonce = Vite::cspNonce();
    @endphp

    <script @if (filled($nonce)) nonce="{{ $nonce }}" @endif>
        window.filamentData = @js($data)
    </script>
@endif

@foreach ($assets as $asset)
    @if (! $asset->isLoadedOnRequest())
        {{ $asset->getHtml() }}
    @endif
@endforeach

@php
    $styleNonce = Vite::cspNonce();
@endphp

{{-- Copia de la vista de filament/support con el nonce de la CSP en el <style> (ADR 0025). --}}
<style @if (filled($styleNonce)) nonce="{{ $styleNonce }}" @endif>
    :root {
        @foreach ($cssVariables ?? [] as $cssVariableName => $cssVariableValue) --{{ $cssVariableName }}:{{ $cssVariableValue }}; @endforeach
    }

    @foreach ($customColors ?? [] as $customColorName => $customColorShades) .fi-color-{{ $customColorName }} { @foreach ($customColorShades as $customColorShade) --color-{{ $customColorShade }}:var(--{{ $customColorName }}-{{ $customColorShade }}); @endforeach } @endforeach
</style>
